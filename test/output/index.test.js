/* eslint-disable id-length, no-shadow, no-undefined */

import Output, { validate, isServer, isString, output_types } from '../../dist/output/index';
import ava from 'ava-spec';
import { join as p } from 'path';
import { stdout } from 'test-console';
import stripAnsi from 'strip-ansi';
import fs from 'fs-extra-promisify';
import { map, reduce } from 'async-array-methods';
import globby from 'globby';
import to from 'to-js';
import { Chance } from 'chance';

const output_root = p(__dirname, '..', 'fixtures', 'output');
const chance = new Chance();

const test = ava.group('output:');

test.beforeEach(async (t) => {
  t.context = new Output({ root: output_root });
});

test('without args', async (t) => {
  t.deepEqual(t.context.options, {
    root: output_root,
    log: true,
    verbose: false,
    spinners: true,
    timestamp: true
  });
  t.truthy(t.context.log_types);
  t.deepEqual(t.context.output_options, {
    format: 'json',
    spacing: 2,
    archive: '',
    output: 'return',
    limit: 10,
    highlight: true,
    server: '127.0.0.1',
    bucket: 'default',
    password: '',
    username: '',
    timeout: 5000,
  });
});

test('output_types', (t) => {
  t.deepEqual(output_types, [ 'return', 'console', 'couchbase', 'sync-gateway' ]);
});

test.group('validation', (test) => {
  test.group('format', (test) => {
    const passing = [ 'json', 'csv', 'yaml', 'yml', 'cson' ];
    passing.forEach((format) => {
      test(`passing ${format}`, (t) => {
        t.context.output_options.format = format;
        try {
          validate.format(format);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });
    const failing = [ 'jpg', 'jpeg', 'js', 'ai', 'psd' ];
    failing.forEach((format) => {
      test(`failing ${format}`, (t) => {
        t.context.output_options.format = format;
        const validateFormat = () => validate.format(format);
        t.throws(validateFormat);
        t.throws(t.context.validateOutputOptions);
      });
    });
  });

  test.group('spacing', (test) => {
    const passing = [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ];
    passing.forEach((spacing) => {
      test(`passing ${spacing}`, (t) => {
        t.context.output_options.spacing = spacing;
        try {
          validate.spacing(spacing);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });
    const failing = [ '', [], {} ];
    failing.forEach((spacing) => {
      test(`failing ${spacing} - ${chance.integer()}`, (t) => {
        t.context.output_options.spacing = spacing;
        const validateSpacing = () => validate.spacing(spacing);
        t.throws(validateSpacing);
        t.throws(t.context.validateOutputOptions);
      });
    });
  });

  test.group('output', (test) => {
    const passing = [ 'return', 'console', 'couchbase', 'sync-gateway', 'output/folder' ];
    passing.forEach((output) => {
      test(`passing ${output}`, (t) => {
        if (output === 'sync-gateway') {
          t.context.output_options.username = 'tyler';
          t.context.output_options.password = 'password';
        } else if (output === 'couchbase') {
          t.context.output_options.password = 'password';
        }
        t.context.output_options.output = output;
        try {
          validate.output(output);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });
    const failing = [ 'outputfile.zip', 2, '', [], {} ];
    failing.forEach((output) => {
      test(`failing ${output} - ${chance.integer()}`, (t) => {
        t.context.output_options.output = output;
        const validateOutput = () => validate.output(output);
        t.throws(validateOutput);
        t.throws(t.context.validateOutputOptions);
      });
    });
  });

  test.group('limit', (test) => {
    const passing = [ 100, 200, 300, 400, 500, 600, 700, 800 ];
    passing.forEach((limit) => {
      test(`passing ${limit}`, (t) => {
        t.context.output_options.limit = limit;
        try {
          validate.limit(limit);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });
    const failing = [ '', [], {} ];
    failing.forEach((limit) => {
      test(`failing ${limit} - ${chance.integer()}`, (t) => {
        t.context.output_options.limit = limit;
        const validateLimit = () => validate.limit(limit);
        t.throws(validateLimit);
        t.throws(t.context.validateOutputOptions);
      });
    });
  });

  test.group('highlight', (test) => {
    const passing = [ true, false ];
    passing.forEach((highlight) => {
      test(`passing ${highlight}`, (t) => {
        t.context.output_options.highlight = highlight;
        try {
          validate.highlight(highlight);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });
    const failing = [ 2, '', [], {} ];
    failing.forEach((highlight) => {
      test(`failing ${highlight} - ${chance.integer()}`, (t) => {
        t.context.output_options.highlight = highlight;
        const validateHighlight = () => validate.highlight(highlight);
        t.throws(validateHighlight);
        t.throws(t.context.validateOutputOptions);
      });
    });
  });

  test.group('archive', (test) => {
    const passing = [ 'one.zip', '' ];
    passing.forEach((archive) => {
      test(`passing ${archive}`, (t) => {
        t.context.output_options.output = 'somefolder';
        t.context.output_options.archive = archive;
        try {
          validate.archive(archive, t.context.output_options);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });

    test('passing output is return', (t) => {
      t.context.output_options.archive = '';
      try {
        validate.archive(t.context.output_options.archive, t.context.output_options);
        t.context.validateOutputOptions();
        t.pass();
      } catch (e) {
        t.fail(e);
      }
    });

    test('passing output is console', (t) => {
      t.context.output_options.output = 'console';
      t.context.output_options.archive = '';
      try {
        validate.archive(t.context.output_options.archive, t.context.output_options);
        t.context.validateOutputOptions();
        t.pass();
      } catch (e) {
        t.fail(e);
      }
    });

    const failing = [ true, false, 2, '', [], {} ];
    failing.forEach((archive) => {
      test(`failing ${archive} - ${chance.integer()}`, (t) => {
        t.context.output_options.archive = archive;
        const validateArchive = () => validate.archive(archive);
        t.throws(validateArchive);
        t.throws(t.context.validateOutputOptions);
      });
    });

    test('failing output is return', (t) => {
      t.context.output_options.archive = 'somefile.zip';
      const validateArchive = () => validate.archive(t.context.output_options.archive, t.context.output_options);
      t.throws(validateArchive);
      t.throws(t.context.validateOutputOptions);
    });

    test.serial('failing output because `archive` isn\'t a `.zip` file', (t) => {
      t.context.output_options.archive = 'somefile.woohoo';
      t.context.output_options.output = 'somefolder';
      const validateArchive = () => validate.archive(t.context.output_options.archive, t.context.output_options);
      const validateOutputOptions = () => t.context.validateOutputOptions();
      const inspect = stdout.inspect();
      t.throws(validateArchive);
      t.throws(validateOutputOptions);
      inspect.restore();
    });

    test('failing output is console', (t) => {
      t.context.output_options.output = 'console';
      t.context.output_options.archive = 'somefile.zip';
      const validateArchive = () => validate.archive(t.context.output_options.archive, t.context.output_options);
      t.throws(validateArchive);
      t.throws(t.context.validateOutputOptions);
    });

    test('failing output a string wasn\'t passed as the option', (t) => {
      t.context.output_options.output = 'test-folder';
      t.context.output_options.archive = [];
      const validateArchive = () => validate.archive(t.context.output_options.archive, t.context.output_options);
      t.throws(validateArchive);
      t.throws(t.context.validateOutputOptions);
    });
  });

  test.group('server', (test) => {
    const passing = [ '127.0.0.1', '127.0.0.1:8080', 'http://localhost:3000' ];
    const servers = [ 'sync-gateway', 'couchbase', 'sync-gateway', 'couchbase' ];
    passing.forEach((server, i) => {
      test(`passing ${server}`, (t) => {
        if (server !== 'couchbase') {
          t.context.output_options.username = 'tyler';
        }
        t.context.output_options.password = 'password';
        t.context.output_options.output = servers[i];
        t.context.output_options.server = server;
        try {
          validate.server(server, t.context.output_options);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });

    const failing = [ 2, '', [], {} ];
    failing.forEach((server, i) => {
      test(`failing ${server} - ${chance.integer()}`, (t) => {
        if (server !== 'couchbase') {
          t.context.output_options.username = 'tyler';
        }
        t.context.output_options.password = 'password';
        t.context.output_options.output = servers[i];
        t.context.output_options.server = server;
        const validateServer = () => validate.server(server, t.context.output_options);
        t.throws(validateServer);
        t.throws(t.context.validateOutputOptions);
      });
    });

    test('failing archive is true and output is couchbase', (t) => {
      t.context.output_options.output = 'couchbase';
      t.context.output_options.archive = true;
      t.context.output_options.server = '127.0.0.1';

      const validateServer = () => validate.server(t.context.output_options.server, t.context.output_options);
      t.throws(validateServer);
      t.throws(t.context.validateOutputOptions);
    });

    test('failing archive is true and output is sync-gateway', (t) => {
      t.context.output_options.output = 'sync-gateway';
      t.context.output_options.archive = true;
      t.context.output_options.server = '127.0.0.1';
      const validateServer = () => validate.server(t.context.output_options.server, t.context.output_options);
      t.throws(validateServer);
      t.throws(t.context.validateOutputOptions);
    });
  });

  test.group('bucket', (test) => {
    const passing = [ 'asdfasdfasdf', 'asdfasdfsadf', 'asfasdfasdfasdfasdf' ];
    const servers = [ 'sync-gateway', 'couchbase', 'sync-gateway', 'couchbase' ];
    passing.forEach((bucket, i) => {
      test(`passing ${bucket}`, (t) => {
        t.context.output_options.username = 'tyler';
        t.context.output_options.password = 'password';
        t.context.output_options.output = servers[i];
        t.context.output_options.bucket = bucket;
        try {
          validate.bucket(bucket, t.context.output_options);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });

    const failing = [ 2, '', [], {} ];
    failing.forEach((bucket, i) => {
      test(`failing ${bucket} - ${chance.integer()}`, (t) => {
        t.context.output_options.username = 'tyler';
        t.context.output_options.password = 'password';
        t.context.output_options.output = servers[i];
        t.context.output_options.bucket = bucket;
        const validateBucket = () => validate.bucket(bucket, t.context.output_options);
        t.throws(validateBucket);
        t.throws(t.context.validateOutputOptions);
      });
    });
  });

  test.group('username', (test) => {
    const passing = [ 'asdfasdfasdf', 'asdfasdfsadf', 'asfasdfasdfasdfasdf' ];
    const servers = [ 'sync-gateway', 'couchbase', 'sync-gateway', 'couchbase' ];
    passing.forEach((username, i) => {
      test(`passing ${username}`, (t) => {
        t.context.output_options.username = username;
        t.context.output_options.password = 'password';
        t.context.output_options.output = servers[i];
        try {
          validate.username(username, t.context.output_options);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });

    const failing = [ 2, '', [], {} ];
    failing.forEach((username, i) => {
      test(`failing ${username} - ${chance.integer()}`, (t) => {
        if (servers[i] !== 'couchbase') {
          t.context.output_options.username = username;
          t.context.output_options.password = 'password';
          t.context.output_options.output = 'sync-gateway';
          const validateUsername = () => validate.username(username, t.context.output_options);
          t.throws(validateUsername);
          t.throws(t.context.validateOutputOptions);
        }
      });
    });
  });

  test.group('password', (test) => {
    const passing = [ 'asdfasdfasdf', 'asdfasdfsadf', 'asfasdfasdfasdfasdf' ];
    const servers = [ 'sync-gateway', 'couchbase', 'sync-gateway', 'couchbase' ];
    passing.forEach((password, i) => {
      test(`passing ${password}`, (t) => {
        t.context.output_options.username = 'tyler';
        t.context.output_options.password = password;
        t.context.output_options.output = servers[i];
        try {
          validate.password(password, t.context.output_options);
          t.context.validateOutputOptions();
          t.pass();
        } catch (e) {
          t.fail(e);
        }
      });
    });

    const failing = [ 2, [], {} ];
    failing.forEach((password, i) => {
      test(`failing ${password} - ${chance.integer()}`, (t) => {
        t.context.output_options.username = 'tyler';
        t.context.output_options.password = password;
        t.context.output_options.output = servers[i];
        const validatePassword = () => validate.password(password, t.context.output_options);
        t.throws(validatePassword);
        t.throws(t.context.validateOutputOptions);
      });
    });

    test.group('timeout', (test) => {
      const passing = [ 100, 200, 300, 400, 500, 600, 700, 800 ];
      passing.forEach((timeout) => {
        test(`passing ${timeout}`, (t) => {
          t.context.output_options.timeout = timeout;
          try {
            validate.timeout(timeout);
            t.context.validateOutputOptions();
            t.pass();
          } catch (e) {
            t.fail(e);
          }
        });
      });
      const failing = [ '', [], {} ];
      failing.forEach((timeout) => {
        test(`failing ${timeout} - ${chance.integer()}`, (t) => {
          t.context.output_options.timeout = timeout;
          const validateTimeout = () => validate.timeout(timeout);
          t.throws(validateTimeout);
          t.throws(t.context.validateOutputOptions);
        });
      });
    });
  });

  test('isServer', (t) => {
    t.truthy(isServer('sync-gateway'));
    t.truthy(isServer('couchbase'));
    t.falsy(isServer(''));
    t.falsy(isServer('asdfasd'));
    t.falsy(isServer('asdfasdasdasafsdfsd'));
    t.falsy(isServer(2));
  });

  test('isString', (t) => {
    t.truthy(isString('asdfasdf'));
    t.truthy(isString('asdaffsdasdfasd'));
    t.throws(() => isString(''));
    t.throws(() => isString(2));
    t.throws(() => isString([]));
    t.throws(() => isString({}));
  });
});


test.serial.group('prepare', (test) => {
  const root = p(output_root, 'prepare');

  test('without options', async (t) => {
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.prepare();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.outputter, undefined);
    // t.is(t.context.prepared, true);
  });

  test('with output as console', async (t) => {
    t.context.output_options.output = 'console';
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.prepare();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.outputter.constructor.name, 'Console');
    t.is(t.context.prepared, true);
  });

  test('zip', async (t) => {
    t.context.options.root = root;
    t.context.output_options.output = 'zip';
    t.context.output_options.archive = 'archive.zip';
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.prepare();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.outputter.constructor.name, 'Zip');
    t.is(to.type(t.context.outputter.zip), 'object');
    t.is(t.context.prepared, true);
    t.deepEqual(await globby('zip', { cwd: root }), []);
    t.deepEqual(await globby(p('zip', '**', '*'), { cwd: root }), []);
  });

  test('folder', async (t) => {
    t.context.options.root = root;
    t.context.output_options.output = 'folder';
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.prepare();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.outputter.constructor.name, 'Folder');
    t.is(t.context.prepared, true);
    t.deepEqual(await globby('folder', { cwd: root }), []);
    t.deepEqual(await globby(p('folder', '**', '*'), { cwd: root }), []);
  });

  test.after.always(() => fs.remove(root));
});


test.serial.group('setup', (test) => {
  test('without options', async (t) => {
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.setup();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.outputter, undefined);
    // t.is(t.context.prepared, true);
  });

  test('with output as console', async (t) => {
    t.context.output_options.output = 'console';
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.setup();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.outputter.constructor.name, 'Console');
    t.is(t.context.prepared, true);
  });
});


test.group('output', (test) => {
  const root = p(output_root, 'output');
  let data;

  test.before(async () => {
    data = await getData();
  });

  test.serial.group('return', languages((test, language) => {
    test(language, async (t) => {
      const { raw, node } = data[language];
      t.context.output_options.output = 'return';
      t.context.output_options.format = language;
      t.is(t.context.prepared, false);
      t.is(t.context.preparing, undefined);
      const actual = await t.context.output(raw);
      // t.is(t.context.prepared, true);
      t.deepEqual(actual, node);
    });
  }));

  test.serial.group('console', languages((test, language) => {
    test(language, async (t) => {
      const { raw, node } = data[language];
      t.context.output_options.output = 'console';
      t.context.output_options.format = language;
      t.is(t.context.prepared, false);
      t.is(t.context.preparing, undefined);
      const inspect = stdout.inspect();
      await t.context.output(raw);
      t.is(t.context.prepared, true);
      inspect.restore();
      // t.not(inspect.output[0].trim(), node);
      if (language !== 'csv') {
        t.is(stripAnsi(inspect.output[0]).trim(), node);
      }
    });
  }));

  test.group('folder', languages((test, language) => {
    test(language, async (t) => {
      const { raw, nodes } = data[language];
      const keys = to.keys(nodes).sort();
      t.plan(keys.length + 4);
      // change the root folder to be under folder so it's easier
      // to remove the tests for `folder` after they're done.
      t.context.options.root = p(root, 'folder');
      const output = t.context.output_options.format = t.context.output_options.output = language;
      t.is(t.context.prepared, false);
      t.is(t.context.preparing, undefined);
      await t.context.output(raw);
      t.is(t.context.prepared, true);

      // ge all the files in the output folder
      const files = await globby('*', { cwd: p(root, 'folder', output) });

      // all the files exist
      t.deepEqual(files.map((file) => file.split('.')[0]).sort(), keys);

      // this ensures that all the files match the correct output
      await map(files, async (file) => {
        const content = to.string(await fs.readFile(p(root, 'folder', output, file))).trim();
        const name = file.split('.')[0];
        t.deepEqual(content, nodes[name]);
      });
    });
  }));


  test.group('zip', languages((test, language) => {
    if (language !== 'json') {
      return;
    }
    test(language, async (t) => {
      const { raw, nodes } = data[language];
      const keys = to.keys(nodes).sort();

      // change the root folder to be under folder so it's easier
      // to remove the tests for `folder` after they're done.
      t.context.options.root = p(root, 'zip');
      t.context.output_options.format = t.context.output_options.output = language;
      t.context.output_options.archive = `${language}.zip`;
      t.is(t.context.prepared, false);
      t.is(t.context.preparing, undefined);
      await t.context.output(raw);
      t.is(t.context.prepared, true);
      t.is(to.type(t.context.outputter.zip), 'object');
      const files = t.context.outputter.zip.getEntries().map(({ name }) => name.split('.')[0]);
      t.deepEqual(files.sort(), keys);
    });
  }));


  test('throws error', async (t) => {
    t.context.output_options.output = p(root, 'error-folder');
    await t.context.prepare();
    t.context.outputter.output = function output() {
      throw new Error('failed correctly');
    };
    const inspect = stdout.inspect();

    await t.context.output(data.json.raw)
      .then(() => t.fail())
      .catch(() => t.pass());
    inspect.restore();
    t.truthy(/\[?Error: failed correctly\]?/.test(inspect.output[1].split(/\n/)[0].trim()));
  });

  // These are too difficult to unit test but they are tested else where
  // test.group('couchbase', (test) => {
  //   test.todo();
  // });
  //
  // test.group('sync-gateway', (test) => {
  //   test.todo();
  // });

  test.after.always(() => fs.remove(root));
});

// This will loop through each of the languages to run tests for each one.
// It makes it easier to test each language for each type of output rather
// than duplicating the loop on each test
function languages(cb) {
  return (test) => {
    for (let language of [ 'cson', 'csv', 'json', 'yaml', 'yml' ]) {
      cb(test, language);
    }
  };
}


// this generates the data that is used to test
// it returns an object of the language types and their data
// each language will have an object of
// {
//   raw: '', // the test data
//   node: '', // the expected file
//   nodes: {} // the expected nodes that will get created
// }
async function getData() {
  const file_types = [ 'cson', 'csv', 'json', 'yaml', 'yml' ];
  const root = p(__dirname, '..', 'fixtures', 'test-data');
  const raw = await fs.readJson(p(root, 'data.json'));

  return reduce(file_types, async (prev, next) => {
    const data = {
      // holds the full set of data
      // this is used for the console and return
      node: '',
      // holds the individual data nodes
      nodes: {},
      // the raw data nodes
      raw: to.clone(raw).map((node) => {
        Object.defineProperty(node, '__key', { value: `${next}-${node.id}` });
        Object.defineProperty(node, '__name', { value: `${next}-${node.id}` });
        return node;
      }),
    };

    const file = p(root, `data.${next}`);

    if (next === 'json') {
      data.node = to.json(raw);
    } else {
      data.node = to.string(await fs.readFile(file)).trim();
    }

    switch (next) {
      case 'yaml':
      case 'yml':
        data.nodes = data.node
          .replace(/^\s+/gm, '')
          .split('-')
          .filter(Boolean)
          .map((line) => line.trim());
        break;
      case 'cson':
        data.nodes = data.node
          .split('\n')
          .slice(1, -1)
          .join('\n')
          .split(/(?={)/)
          .map((item) => item.replace(/[{}]| \s{2,}/g, '').trim())
          .filter(Boolean);
        break;
      case 'json':
        data.nodes = to.object(data.node).map((item) => to.json(item));
        break;
      case 'csv':
        data.nodes = {
          [`csv-${raw[0].id}`]: data.node
        };
        break;
      default:
        data.nodes = data.node;
    }

    if (next !== 'csv') {
      let items = data.nodes;
      data.nodes = {};
      for (let [ i, node ] of to.entries(raw)) {
        data.nodes[`${next}-${node.id}`] = items[i];
      }
    }

    prev[next] = data;
    return prev;
  }, {});
}
