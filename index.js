#!/usr/bin/env node

import yargs from 'yargs';
import readlineSync from 'readline-sync';

const argv = yargs(process.argv.slice(2))
  .command(['p <database>' /* , '*' */], "Print table's creation sql formatted for easier comparison (only tables and indexes)")
  //.command( 'p <database>', 'Print table creation sql')
  .command('f <database> [dir]', 'Create separate file for every table with sql for comparison', y => {
    y.positional('dir', {
      describe: 'Directory to save files',
      type: 'string',
      default: './'
    });
  })
  .option('h', {
    alias: 'host',
    description: 'Database host',
    type: 'string'
  })
  .default('h', 'localhost')
  .option('u', {
    alias: 'user',
    description: 'Database user',
    type: 'string'
  })
  .option('p', {
    alias: 'password',
    description: 'User password',
    type: 'string'
  })
  .option('verbose', {
    description: 'Verbose logging',
    type: 'boolean'
  })
  .group(['h', 'u', 'p'], 'Connection parameters:')
  .demandCommand(1, 'Need a command')
  .usage('Usage: $0 <command> <database> [options]')
  .help('help')
  .version(false)
  .locale('en')
  .wrap(null).argv;

var connParams = {
  host: argv.host,
  user: argv.user ? argv.user : process.env.USER || '',
  password: argv.password ? argv.password : '',
  database: argv.database
};

if (argv.hasOwnProperty('password') && argv.password === '') {
  // Need to type the password
  connParams.password = readlineSync.question('Enter password: ', {
    hideEchoBack: true,
    mask: ''
  });
}

if (argv.verbose) {
  console.log(
    `Connecting to database '${connParams.database}' on '${connParams.host}' with username '${connParams.user}' and password:`,
    connParams.password === '' ? 'No' : 'Yes'
  );
  if (argv.c) {
    console.log('All sql statements will be formatted for easy comparison');
  }
}

const cmd = argv._[0];

import { cmdFiles, cmdPrint } from './lib/commands.js';

if (cmd === 'f') {
  cmdFiles(connParams, argv);
} else {
  cmdPrint(connParams, argv);
}
