import { join as p } from 'path';
import ava from 'ava-spec';
import to from 'to-js';
import fs from 'fs-extra-promisify';
import nixt from 'nixt';
import stripAnsi from 'strip-ansi';
const bin = nixt().cwd(p(__dirname, 'fixtures', 'models')).base('../../../bin/fakeit ');
import cli, { code, dim } from '../dist/cli.js';
import _ from 'lodash';
const test = ava.group('cli:');


test('cli is the default function', (t) => {
  t.is(typeof cli, 'function');
});


test.group('console', (test) => {
  const expected_keys = [
    'id',
    'type',
    'user_id',
    'first_name',
    'last_name',
    'email_address',
    'phone',
    'active',
    'created_on'
  ];

  /* eslint-disable max-len */
  const expected_abc_seed = {
    _id: 'contact_1d54ed12-b65a-5085-a895-5c8c626f0efb',
    doc_type: 'contact',
    contact_id: '1d54ed12-b65a-5085-a895-5c8c626f0efb',
    details: { prefix: 'Dr.', first_name: 'Daphnee', middle_name: 'Dale', last_name: 'O\'Hara', company: 'Hackett - Effertz', job_title: null, nickname: null },
    phones: [ { type: 'Mobile', phone_number: '076-099-8620', extension: null }, { type: 'Other', phone_number: '965-618-1647', extension: null } ],
    emails: [ 'Abigale.Bashirian@gmail.com', 'Demetris12@gmail.com' ],
    addresses: [ { type: 'Work', address_1: '96735 Caroline Fields Springs', address_2: null, locality: 'Montanastad', region: 'SD', postal_code: '11307-4822', country: 'LA' } ],
    children: [ { first_name: 'Cielo', gender: null, age: 13 }, { first_name: 'Francesca', gender: null, age: 10 } ],
    notes: 'Ea debitis possimus non inventore inventore dignissimos id.',
    tags: [ 'Soap', 'Buckinghamshire', 'Chief', 'hacking', 'Generic' ]
  };
  /* eslint-enable max-len */

  /* eslint-disable quotes */
  test.cb("--count 1 'simple/models/*'", (t) => {
    bin.clone()
      .run("console --count 1 'simple/models/*'")
      .expect(({ stdout }) => {
        const data = to.object(stdout);
        t.is(to.type(data), 'array');
        t.is(data.length, 1);
        t.deepEqual(to.keys(data[0]), expected_keys);
      })
      .end(t.end);
  });

  test.cb("--count 1 'simple/models/*' --format 'csv'", (t) => {
    bin.clone()
      .run("console --count 1 'simple/models/*' --format 'csv'")
      .expect(({ stdout }) => {
        stdout = stdout.split('\n');
        t.truthy(/^[┌─┬┐]+$/.test(stdout[0]));
        t.truthy(/^[├─┼┤]+$/.test(stdout[2]));
        t.truthy(/^[└─┴┘]+$/.test(stdout[4]));
        t.deepEqual(stdout[1].slice(1, -1).trim().split(/\s*│\s*/g), expected_keys);
        t.is(stdout[3].slice(1, -1).trim().split(/\s*│\s*/g).length, 9);
      })
      .end(t.end);
  });

  test.cb("'simple/models/*' --format 'csv' --count 1 --no-highlight", (t) => {
    bin.clone()
      .run("console 'simple/models/*' --format 'csv' --count 1 --no-highlight")
      .expect(({ stdout }) => {
        stdout = stdout.split('\n');
        t.is(stdout[0], '"id","type","user_id","first_name","last_name","email_address","phone","active","created_on"');
        t.deepEqual(stdout[0].replace(/"/g, '').split(','), expected_keys);
      })
      .end(t.end);
  });


  test.cb('contacts/models/contacts.yaml --count 1 --seed abc', (t) => {
    bin.clone()
      .run('console contacts/models/contacts.yaml --count 1 --seed abc')
      .expect(({ stdout }) => {
        stdout = to.object(stdout);
        t.is(to.type(stdout), 'array');
        t.is(stdout.length, 1);

        // remove the id column and dates because they can't be correct
        stdout = _.omit(stdout[0], [ 'created_on', 'modified_on' ]);
        stdout.details = _.omit(stdout.details, [ 'dob' ]);

        t.truthy(stdout.doc_type);
        t.truthy(stdout.contact_id);
        t.truthy(stdout.details.first_name);
        t.truthy(stdout.details.last_name);
        t.truthy(stdout.phones.length > 0);
        t.truthy(stdout.emails.length > 0);
        t.truthy(stdout.addresses.length > 0);
        t.truthy(stdout.children.length > 0);
        t.truthy(stdout.tags.length > 0);
      })
      .end(t.end);
  });

  test.cb('contacts/models/contacts.yaml --count 1 --seed 123456789', (t) => {
    bin.clone()
      .run('console contacts/models/contacts.yaml --count 1 --seed 123456789')
      .expect(({ stdout }) => {
        stdout = to.object(stdout);
        t.is(to.type(stdout), 'array');
        t.is(stdout.length, 1);

        stdout = _.omit(stdout[0], [
          // remove the dates because they can't be correct
          'created_on',
          'modified_on',
          // These values are hard coded and never change so they should be the same
          'doc_type',
          'channels',
        ]);
        // removed the dob because it's a date
        stdout.details = _.omit(stdout.details, [ 'dob' ]);

        for (let key in stdout) {
          if (stdout.hasOwnProperty(key)) {
            const value = stdout[key];
            const not_expected = expected_abc_seed[key];
            // it's a different key so it should be different
            t.notDeepEqual(value, not_expected);
          }
        }
      })
      .end(t.end);
  });

  /* eslint-enable quotes */
});


test.group('directory|folder', (test) => {
  /* eslint-disable quotes */
  const root = p(__dirname, 'directory-cli-test');
  const base = nixt().cwd(root).base('../../bin/fakeit ');
  const expected_keys = [
    'id',
    'type',
    'user_id',
    'first_name',
    'last_name',
    'email_address',
    'phone',
    'active',
    'created_on'
  ];

  test.before(async () => {
    await fs.remove(root);
    await fs.ensureDir(root);
  });

  test.cb('output files to directory', (t) => {
    const file = p(root, 'directory-test', 'user_0.json');
    base.clone()
      .run(`directory 'directory-test' '../fixtures/models/simple/models/users.yaml' --count 1`)
      .exist(file)
      .match(file, new RegExp(`"${expected_keys.join('|')}":`, 'g'))
      .end(t.end);
  });

  test.cb('zip output by passing in as the file.zip', (t) => {
    base.clone()
      .run(`folder 'zip-test.zip' '../fixtures/models/simple/models/users.yaml' --count 1`)
      .exist(p(root, 'zip-test.zip'))
      .end(t.end);
  });

  test.cb('zip output by passing in --archive as an option', (t) => {
    base.clone()
      .run(`folder 'zip-test' '../fixtures/models/simple/models/users.yaml' --count 1 --archive 'archive.zip'`)
      .exist(p(root, 'zip-test', 'archive.zip'))
      .end(t.end);
  });

  test.after.always(() => fs.remove(root));
  /* eslint-enable quotes */
});

test.cb('throws error when something goes wrong', (t) => {
  /* eslint-disable quotes */
  bin.clone()
    .run(`folder 'error-test' 'simple/models/*' --count 1 --archive 'woohoo'`)
    .stdout(/The archive file must have a file extention of \`\.zip\`/)
    .code(1)
    .end(t.end);
  /* eslint-enable quotes */
});

test.group('help', (test) => {
  test.cb('help as argument', (t) => {
    bin.clone()
      .run('help')
      .stdout(/^\s*Usage: fakeit \[command\] \[\<file\|directory\|glob\> \.\.\.\]/)
      .end(t.end);
  });

  test.cb('no arguments were passed', (t) => {
    bin.clone()
      .run('')
      .stdout(/^\s*Usage: fakeit \[command\] \[\<file\|directory\|glob\> \.\.\.\]/)
      .end(t.end);
  });

  test.cb('console action with no model arguments', (t) => {
    bin.clone()
      .run('console')
      .stdout(/^.*warning.*:\s+you must pass in models to use/)
      .end(t.end);
  });
});

test('code', (t) => {
  t.is(code('one'), 'one');
  t.deepEqual(stripAnsi(code('one', 'two', 'three')).split(/\s*,\s*/), [ 'one', 'two', 'three' ]);
});

test('dim', (t) => {
  t.is(dim('one'), 'one');
  t.deepEqual(stripAnsi(dim('one', 'two', 'three')).split(/\s*,\s*/), [ 'one', 'two', 'three' ]);
});
