import default_options from '../dist/output/default-options';
import to from 'to-js';
import globby from 'globby';
import fs from 'fs-extra-promisify';
import { stdout } from 'test-console';
import path, { join as p } from 'path';
import stripAnsi from 'strip-ansi';
import ava from 'ava-spec';
import AdmZip from 'adm-zip';
import Fakeit from '../dist/index.js';

const test = ava.group('fakeit');
const fakeit_root = p(__dirname, 'fixtures', 'models');
const folder_root = p(__dirname, 'fixtures', 'fakeit-folder-test');
const zip_root = p(__dirname, 'fixtures', 'fakeit-zip-test');

test.before(() => Promise.all([ fs.remove(folder_root), fs.remove(zip_root) ]));

/* istanbul ignore next */
const models = require('./utils').models({
  root: fakeit_root,
  // Get the models to test. This is used by the `models` function located at the bottom of this file
  modules: '*/models/*.yaml',
  // this gets the correct validation file to use on a per test basis
  validation(model) {
    return model.replace(/models(.*)\.yaml/g, 'validation$1.data.js');
  }
});


test.beforeEach((t) => {
  t.context.fakeit = new Fakeit({
    root: fakeit_root,
    count: 1,
    log: false
  });

  t.context.defaults = to.clone(default_options);
});


test('without args', async (t) => {
  delete t.context.fakeit.options.count;
  t.context.fakeit.options.log = t.context.fakeit.options.spinners = true;

  t.deepEqual(t.context.fakeit.options, {
    root: fakeit_root,
    log: true,
    verbose: false,
    spinners: true,
    timestamp: true,
  });
  t.is(to.type(t.context.fakeit.documents), 'object');
  t.is(to.type(t.context.fakeit.globals), 'object');
});


const generate = test.group('generate');
generate('generate no models', async (t) => {
  // you can run generate an nothing will happen
  try {
    await t.context.fakeit.generate();
    t.pass();
  } catch (e) {
    t.fail();
  }
});


generate.serial.group('console', models(async (t, model) => {
  t.context.defaults.output = 'console';

  const inspect = stdout.inspect();
  await t.context.fakeit.generate(model, t.context.defaults);
  inspect.restore();
  const actual = to.object(stripAnsi(inspect.output[0].trim()))[0];

  return actual;
}));


generate.group('return', models(async (t, model) => {
  t.context.defaults.output = 'return';
  let actual = await t.context.fakeit.generate(model, t.context.defaults);
  // get the first item in the list of the tests
  // and convert it to an object
  actual = to.object(actual[0]);
  // get the first item in the array to test
  return actual[0];
}));


generate.group('supports globs', (test) => {
  test('ecommerce/**/*.yaml', async (t) => {
    t.context.defaults.output = 'return';
    const actual = await t.context.fakeit.generate('ecommerce/**/*.yaml', t.context.defaults);

    t.is(actual.length, 4);
    const doc_types = actual.map((item) => to.object(item)[0].doc_type).sort();
    t.deepEqual(doc_types, [ 'product', 'user', 'review', 'order' ].sort());
  });

  test('ecommerce/**/@(o|p)*.yaml', async (t) => {
    t.context.defaults.output = 'return';
    const actual = await t.context.fakeit.generate('ecommerce/**/@(orders|products).yaml', t.context.defaults);

    // only the files that were passed should be returned which should be `products`, and `orders`
    const doc_types = actual.map((item) => to.object(item)[0].doc_type).sort();
    t.deepEqual(doc_types, [ 'order', 'product' ]);
  });
});


generate.group('folder', models(async (t, model) => {
  const root = p(folder_root, model.replace(new RegExp(path.sep, 'g'), '-').replace('.yaml', ''));
  t.context.defaults.output = root;
  await t.context.fakeit.generate(model, t.context.defaults);
  const files = await globby(p(root, '**', '*'));
  t.is(files.length, 1);
  return fs.readJson(files[0]);
}));


generate.group('zip', models(async (t, model) => {
  const root = p(zip_root, model.replace(new RegExp(path.sep, 'g'), '-').replace('.yaml', ''));
  t.context.defaults.output = root;
  t.context.defaults.archive = 'archive.zip';
  await t.context.fakeit.generate(model, t.context.defaults);

  const files = await globby(p(root, '**', '*'));

  t.is(files.length, 1);
  t.is(path.extname(files[0]), '.zip');
  const zip = new AdmZip(files[0]);

  t.is(zip.getEntries().length, 1);
  const entry_file = zip.getEntries()[0].name;

  t.is(path.extname(entry_file), '.json');

  // read the entry_file from the zip file and convert it to an object from a json string
  return to.object(zip.readAsText(entry_file));
}));


// couchbase and sync-gateway are too difficult to test in this way
// since we have to use the mock equivalents of some of their inner functions
// so they are not tested here, but they're functionality is tested else where.
// generate.group('couchbase', models(async (t, model) => {
//   t.is(typeof model, 'string');
//   t.pass();
// }, null, models.files));
//
// generate.group('sync-gateway', models(async (t, model) => {
//   t.is(typeof model, 'string');
//   t.pass();
// }, null, models.files));


// log all the schema keys that still need to be done
test.after.always(() => {
  models.todo();
  return Promise.all([ fs.remove(folder_root), fs.remove(zip_root) ]);
});
