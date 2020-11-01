import * as mysql from 'mysql2/promise';
import chalk from 'chalk';

export async function getTables(params, verbose) {
  //
  if (params.host !== 'localhost' && !params.hasOwnProperty('compress')) {
    params.compress = true;
  }

  const conn = await mysql.createConnection(params).catch(logException);

  if (conn === undefined) {
    if (verbose) {
      logVerbose("Can't create a connection");
    }
    return;
  }

  if (verbose) {
    logVerbose('Connection established');
    logVerbose('Query table list');
  }

  // Tables

  var [rows, fields] = await conn
    .query(
      `
		SELECT table_name, engine, table_collation, auto_increment, create_options
		FROM information_schema.tables
		WHERE table_schema = ? AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`,
      [params.database]
    )
    .catch(logException);

  if (verbose) {
    logVerbose('Got ' + rows.length + ' row(s), ' + fields.length + ' field(s)');
  }

  if (rows.length == 0) {
    //Empty result
    conn.end();
    return [];
  }

  let tableProps = {};
  let tables = rows.map(row => {
    tableProps[row.table_name] = {
      name: row.table_name,
      engine: row.engine,
      collation: row.table_collation,
      auto_increment: row.auto_increment,
      options: row.create_options,
      columns: [],
      indexes: []
    };

    return tableProps[row.table_name];
  });

  // Columns

  if (verbose) {
    logVerbose('Query columns');
  }

  [rows, fields] = await conn
    .query(
      `
		SELECT table_name, column_name, column_type, is_nullable, column_default, extra
		FROM information_schema.columns
		WHERE table_schema = ?
		ORDER BY table_name ASC, ordinal_position ASC
	`,
      [params.database]
    )
    .catch(logException);

  if (verbose) {
    logVerbose('Got ' + rows.length + ' row(s), ' + fields.length + ' field(s)');
  }

  for (let row of rows) {
    let table = tableProps[row.table_name];

    if (table === undefined) {
      logWarning('Unexpected table name in columns result', row.table_name);
      continue;
    }

    table.columns.push({
      name: row.column_name,
      type: row.column_type,
      is_nullable: row.is_nullable.toUpperCase(),
      default: row.column_default,
      extra: row.extra.toUpperCase()
    });
  }

  // Indexes

  if (verbose) {
    logVerbose('Query indexes');
  }

  [rows, fields] = await conn
    .query(
      `
		SELECT table_name, index_name, index_name='PRIMARY' AS is_primary, NOT non_unique AS is_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns
		FROM information_schema.statistics
		WHERE table_schema=?
		GROUP BY table_name, index_name
		ORDER BY table_name, is_primary DESC, non_unique ASC, index_name ASC
	`,
      [params.database]
    )
    .catch(logException);

  if (verbose) {
    logVerbose('Got ' + rows.length + ' row(s), ' + fields.length + ' field(s)');
  }

  for (let row of rows) {
    let table = tableProps[row.table_name];

    if (table === undefined) {
      logWarning('Unexpected table name in indexes result', row.table_name);
      continue;
    }

    table.indexes.push({
      name: row.index_name,
      columns: row.columns,
      is_primary: row.is_primary,
      is_unique: row.is_unique
    });
  }

  conn.end();

  return tables;
}

function logException(e) {
  console.error(chalk.redBright('Error: ' + e.message));
}

function logWarning(text) {
  console.error(chalk.grey('Warning: ' + text));
}

function logVerbose(text) {
  console.error(chalk.grey(text));
}

function formatColumn(col, tableName) {
  let def = [];

  def.push('  `' + col.name + '`');
  def.push(col.type);

  if (col.is_nullable === 'NO') {
    def.push('NOT NULL');
  }

  let dv = col.default;

  if (dv !== null) {
    if (dv === 'NULL') {
      def.push('DEFAULT NULL');
    } else if (dv.search(/^\'[\s\S]*\'$/g) != -1) {
      def.push('DEFAULT ' + dv);
    } else {
      def.push("DEFAULT '" + dv + "'");
    }
  } else if (col.is_nullable === 'NO') {
    logVerbose('Notice: Column `' + tableName + '`.`' + col.name + '` is NOT NULL and has no DEFAULT value');
  } else if (col.is_nullable === 'YES') {
    logVerbose('Notice: Add DEFAULT NULL to column `' + tableName + '`.`' + col.name + '`');
    def.push('DEFAULT NULL');
  }

  if (col.extra !== '') {
    def.push(col.extra);
  }
  return def.join(' ');
}

function formatIndex(index, tableName) {
  let def = [];

  if (index.is_primary == 1) {
    def.push('  PRIMARY KEY');
  } else if (index.is_unique == 1) {
    def.push(`  UNIQUE KEY \`${index.name}\``);
  } else {
    def.push(`  KEY \`${index.name}\``);
  }

  def.push(
    '(' +
      index.columns
        .split(',')
        .map(col => {
          return `\`${col}\``;
        })
        .join(',') +
      ')'
  );

  return def.join(' ');
}

function formatTableProps(table) {
  let def = [];

  def.push('ENGINE=' + table.engine);

  if (table.auto_increment !== null) {
    def.push('AUTO_INCREMENT=N');
  }

  let charset = table.collation.split('_', 2)[0]; // in 'latin1_swedish_ci' a charset is the string before first '_' : 'latin1'
  def.push('DEFAULT CHARSET=' + charset);

  return def;
}

export function formatTableForComparison(table) {
  //
  let cols = table.columns.map(col => {
    return formatColumn(col, table.name);
  });

  let sql = `CREATE TABLE \`${table.name}\` (\n`;
  sql += cols.join(',\n');

  let indexes = table.indexes.map(index => {
    return formatIndex(index, table.name);
  });

  if (indexes.length > 0) {
    sql += ',\n' + indexes.join(',\n');
  }

  sql += '\n)';

  let props = formatTableProps(table);

  if (props.length > 0) {
    sql += '\n';
    sql += props.join('\n');
  }

  return sql;
}
