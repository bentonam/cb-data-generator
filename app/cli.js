import { createCommand } from 'commander';
import Fakeit from './index.js';
import updateNotifier from 'update-notifier';
import pkg from './../package.json';
import path from 'path';
import { extend, flattenDeep, pick, find } from 'lodash';
import chalk from 'chalk';

// this is not a function that is to be called by anything other than the `bin/fakeit` file in the project
export default async function() {
  // check for update and notify
  updateNotifier({ pkg }).notify();

  const base_options = [
    'root',
    'babel',
    'count',
    'verbose',
    'log',
    'spinners',
    'timestamp',
    'seed',
  ];

  const output_options = [
    // global options
    'format',
    'spacing',
    'limit',
    // action specific options
    'highlight',
    'archive',
    'server',
    'bucket',
    'username',
    'password',
    'timeout',
    'useStreams',
    'highWaterMark',
    // gets set based off the command that's used
    'output',
  ];

  const program = createCommand();

  // helper function used for couchbase and sync-gateway below
  function runServer(output) {
    /* istanbul ignore next : too difficult to test the servers via the cli */
    return async (options) => {
      const couchbaseOptions = [
        'server',
        'bucket',
        'username',
        'password',
        'timeout',
        'useStreams',
        'highWaterMark',
      ];
      const commandOptions = pick(options, couchbaseOptions);
      commandOptions.output = output;
      await run(commandOptions);
    };
  }

  // get the inputs
  program
    .version(pkg.version)
    .usage('[command] [<file|directory|glob> ...]')
    // these are all the base options across the different actions
    .option('--root <directory>', `Defines the root directory from which paths are resolve from (${dim('process.cwd()')})`, process.cwd())
    .option('--babel <glob>', `The location to the babel config (${dim('+(.babelrc|package.json)')})`, '+(.babelrc|package.json)')
    .option('-c, --count <n>', 'Overrides the number of documents to generate specified by the model. Defaults to model defined count', parseInt)
    .option('-v, --verbose', `Enables verbose logging mode (${dim(false)})`)
    .option('-S, --no-spinners', 'Disables progress spinners', false)
    .option('-L, --no-log', 'Disables all logging except for errors', false)
    .option('-T, --no-timestamp', 'Disables timestamps from logging output', false)
    // global output options
    .option('-f, --format <type>', `this determines the output format to use. Supported formats: ${code('json', 'csv', 'yaml', 'yml', 'cson')}. (${dim('json')})`, 'json') // eslint-disable-line
    .option('-n, --spacing <n>', `the number of spaces to use for indention (${dim('2')})`, 2)
    .option('-l, --limit <n>', `limit how many files are output at a time (${dim('10')})`, Number, 10)
    .option('-x, --seed <seed>', 'The global seed to use for repeatable data', (seed) => {
      const number = parseInt(seed);

      if (number > 0 || seed === '0') {
        return number;
      }
      return seed;
    });

  // i.e. `fakeit console`
  program
    .command('console')
    .option('-h, --no-highlight', 'This turns off the cli-table when a csv format')
    .description('outputs the result to the console')
    .action(async (options) => {
      const { highlight } = options;

      await run({ output: 'console', highlight });
    });

  // i.e. `fakeit couchbase`
  program
    .command('couchbase')
    .option('-s, --server [server]', `The server address (${dim('127.0.0.1')})`, '127.0.0.1')
    .option('-b, --bucket [bucket]', `The bucket name (${dim('default')})`, 'default')
    .option('-u, --username [username]', 'The username to use (optional pre-5.0)')
    .option('-p, --password [password]', 'the password for the account (optional)')
    .option('-t, --timeout [timeout]', `timeout for the servers (${dim(5000)})`, 5000)
    .option('-r, --use-streams [useStreams]', `${chalk.red('**experimental**')}
                                      Whether or not to use node streams. Used for high output
                                      documents and can only be used when there are no dependencies (${dim(false)})`, false)
    .option('-w, --high-water-mark [highWaterMark]', `${chalk.red('**experimental**')}
                                        The # of objects to process through the stream at a time (${dim(16)})`, 16)
    .description('This will output to a Couchbase Server')
    .action(runServer('couchbase'));

  // i.e. `fakeit sync-gateway`
  program
    .command('sync-gateway')
    .option('-s, --server [server]', `The server address (${dim('127.0.0.1')})`, '127.0.0.1')
    .option('-b, --bucket [bucket]', `The bucket name (${dim('default')})`, 'default')
    .option('-u, --username [username]', 'the username to use (optional)')
    .option('-p, --password [password]', 'the password for the account (optional)')
    .option('-t, --timeout [timeout]', 'timeout for the servers')
    .description('This will output to a Couchbase Sync-Gateway Server')
    .action(runServer('sync-gateway'));

  // i.e. `fakeit directory`
  program
    .command('directory [<dir|file.zip>] [<models...>]')
    .alias('folder')
    .option('-a, --archive [file.zip]', 'If an archive file is passed then the data will be output as a zip file', '')
    .description('Output the file(s) into a directory')
    .action(async (output, models, { archive }) => {
      const parsed = path.parse(output);

      if (parsed.ext) {
        archive = parsed.base;
        output = parsed.dir || program.root;
      }

      // update the program args to be correct
      program.args = process.argv.slice(4);
      await run({ archive, output });
    });


  // i.e. `fakeit help`
  program
    .command('help')
    .action(() => {
      program.help();
    });

  program.parse(process.argv);

  if (!program.args.length) {
    program.help();
  }


  // this function is used as a helper to run the different actions
  async function run(output = {}, opts = {}) {
    output = typeof output === 'string' ? { output } : output;
    // get the base options from program
    opts = pick(extend(pick(program, base_options), opts), base_options);
    // set the babel config
    opts.babel_config = opts.babel;
    delete opts.babel;
    // get the output options
    output = extend(pick(program, output_options), pick(output, output_options));

    // get the output path
    const output_path = path.join(output.output, output.archive || '');

    // eslint-disable-next-line max-len
    const regex = /^(\-\-(?:program|root|babel|count|format|spacing|seed|limit|bucket|username|password|timeout|server|useStreams|highWaterMark)|(?:\-[cfnxl]{1,}))$/;

    // get the model files that have been passed into fakeit
    const models = program.args.filter((str, i, args) => {
      const prev = args[i - 1] || '';

      if (
        typeof str !== 'string' ||
        // if the previous str was one of these commands that has options then remove it
        regex.test(prev) ||
        // if the str is one of the commands then remove it
        /^(([-]{1,2}[a-zA-Z]+)|\-\-no\-[a-z]+)$/.test(str) ||
        // if the str is the same as the output path then remove it
        str === output_path
      ) {
        return false;
      }

      return true;
    });

    const fakeit = new Fakeit(opts);
    if (!models.length) {
      fakeit.log('warning', 'you must pass in models to use');
      find(program.commands, [ '_name', output.output ]).help();
      return;
    }

    try {
      await fakeit.generate(models, output);
      process.exit();
    } catch (err) {
      console.log(err);
      process.exit(1);
    }
  }
}

/* istanbul ignore next : too hard to test */
process.on('uncaughtException', (err) => {
  console.log('An uncaughtException was found:', err);
  process.exit(1);
});

export function code(...args) {
  return flattenDeep(args).map((str) => chalk.bold(str)).join(', ');
}

export function dim(...args) {
  return flattenDeep(args).map((str) => chalk.dim(str)).join(', ');
}
