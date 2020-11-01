import { getTables, formatTableForComparison } from './tablesSchema.js';

export async function cmdPrint(connParams, argv) {
  //
  let tables = await getTables(connParams, argv.verbose);

  if (tables === undefined || tables.length == 0) {
    logError('No tables found');
    return;
  }

  for (let table of tables) {
    let sql = formatTableForComparison(table);
    console.log(sql + '\n');
  }
}

export async function cmdFiles(connParams, argv) {
  //
  let tables = await getTables(connParams, argv.verbose);

  if (tables === undefined || tables.length == 0) {
    logError('No tables found');
    return;
  }

  for (let table of tables) {
    table.sqlCreateTable = formatTableForComparison(table);
    saveTablesInDir([table], argv.dir);
  }
}

function logError(text) {
  console.error(text);
}

import * as fs from 'fs';
import * as path from 'path';

function saveTablesInDir(tables, dir) {
  //
  // Test if dir exists and writeble
  if (!fs.existsSync(dir)) {
    logError('Directory `' + dir + '` does not exists');
    return;
  }

  for (let table of tables) {
    saveInFile(table, dir);
  }
}

function saveInFile(table, dir) {
  //
  const filename = path.join(dir, table.name + '.sql');

  fs.writeFile(filename, table.sqlCreateTable, function (err) {
    if (err) return console.error(err);

    console.log('File', filename, 'saved');
  });
}
