/* eslint-disable no-undefined */

import Models, {
  parseModelInputs,
  parseModelFunctions,
  parseModelReferences,
  parseModelTypes,
  parseModelDefaults,
  parseModelCount,
} from '../dist/models.js';
import path, { join as p } from 'path';
import ava from 'ava-spec';
import to from 'to-js';
import is from 'joi';
import _ from 'lodash';
import fs from 'fs-extra-promisify';
import AdmZip from 'adm-zip';
const test = ava.group('models');
const models_root = p(__dirname, 'fixtures', 'models');
/* istanbul ignore next */
const utils = require('./utils');
const models = utils.models({
  root: models_root,
  // Get the models to test. This is used by the `models` function located at the bottom of this file
  modules: '*/models/*.yaml',
  // this gets the correct validation file to use on a per test basis
  validation(model) {
    return model.replace(/models(.*)\.yaml/g, 'validation$1.model.js');
  }
});

const done = [
  p('contacts', 'models', 'contacts.yaml'),
  p('music', 'models', 'countries.yaml')
];

function filterDone() {
  return _.without(models.files, ...done);
}


let babel_config, contents;

test.before(async () => {
  babel_config = await fs.readJson(p(__dirname, '..', '.babelrc'));
  // get the contents of the models store them on an object so it can be reused
  contents = await models.getContents();
});

test.beforeEach((t) => {
  t.context = new Models({
    root: models_root,
    log: false
  });
});

test('without args', async (t) => {
  t.context.options.log = true;
  const { error } = is.object({
    options: is.object({
      babel_config: is.string().regex(/\+\(\.babelrc\|package\.json\)/),
    })
      .unknown()
      .required(),
    log_types: is.object().required(),
    inputs: is.object().length(0),
    models: is.array().length(0),
    prepared: is.boolean(),
  })
    .validate(t.context);
  if (error) {
    t.fail(error);
  } else {
    t.pass();
  }
});

test('prepare', async (t) => {
  t.is(t.context.prepared, false);
  t.is(t.context.preparing, undefined);
  t.is(typeof t.context.options.babel_config, 'string');
  const preparing = t.context.prepare();
  t.is(typeof t.context.preparing.then, 'function');
  t.is(t.context.prepared, false);
  await preparing;
  t.is(t.context.prepared, true);
  t.is(typeof t.context.options.babel_config, 'object');
  t.deepEqual(t.context.options.babel_config, babel_config);
});

test('setup', async (t) => {
  t.is(t.context.prepared, false);
  t.is(t.context.preparing, undefined);
  t.is(typeof t.context.options.babel_config, 'string');
  const preparing = t.context.setup();
  t.is(typeof t.context.preparing.then, 'function');
  t.is(t.context.prepared, false);
  await preparing;
  t.is(t.context.prepared, true);
  t.is(typeof t.context.options.babel_config, 'object');
  t.deepEqual(t.context.options.babel_config, babel_config);
});

test('registerModels without args', async (t) => {
  // you can run registerModels and nothing will happen
  try {
    await t.context.registerModels();
    t.pass();
  } catch (e) {
    t.fail();
  }
});

test.group('registerModels', models(async (t, model) => {
  await t.context.registerModels(model);
  return t.context.models[0];
}, null, filterDone()));

test.group('parseModelInputs', models(async (t, file) => {
  t.deepEqual(to.keys(t.context.inputs).length, 0);
  const model = to.clone(contents[file]);

  let files = model.data.inputs = t.context.resolvePaths(model.data.inputs, path.resolve(t.context.options.root, path.dirname(file)));
  files = files.map((str) => {
    if (!/.*\.zip/.test(str)) return str;
    const zip = new AdmZip(str);
    return zip.getEntries().map((entry) => {
      if (!entry.isDirectory && !entry.entryName.match(/^(\.|__MACOSX)/)) {
        return entry.entryName;
      }
    });
  });
  files = to.flatten(files).filter(Boolean);

  const expected = files.reduce((prev, next) => {
    prev[path.basename(next).split('.')[0]] = is.any().allow(is.array(), is.object());
    return prev;
  }, {});

  const actual = await parseModelInputs(model);

  const tests = [ t.context.inputs, actual, model.data.inputs ];

  for (let item of tests) {
    const { error } = is.object(expected).validate(item);
    if (error) {
      t.fail(error);
    } else {
      t.pass();
    }
  }
}));

test.group('parseModelFunctions', (test) => {
  test.group('ensure all `pre` and `post` instances are functions', models((t, file) => {
    const model = to.clone(contents[file]);
    const paths = utils.getPaths(model, /((pre|post)_run)|(pre_|post_)?build$/);
    const obj = _.pick(model, paths);
    parseModelFunctions(obj);

    for (let str of paths) {
      let fn = _.get(obj, str);
      t.is(typeof fn, 'function');
      t.is(fn.name, to.camelCase(str));
    }
    return obj;
  }));

  test.group('ensure es6 support', (test) => {
    /* eslint-disable max-len, quotes */
    const tests = [
      {
        name: 'single line has a return',
        actual: '`contact_${this.contact_id}`',
        expected: "function build(_documents, _globals, _inputs, _faker, _chance, _document_index) {\n  function __result(documents, globals, inputs, faker, chance, document_index) {\n    return \"contact_\" + this.contact_id;\n  }\n  return __result.apply(this, [].slice.call(arguments));\n}",
      },
      {
        name: 'multi line doesn\'t have automatic return',
        actual: 'console.log("woohoo");\n`contact_${this.contact_id}`',
        expected: "function build(_documents, _globals, _inputs, _faker, _chance, _document_index) {\n  function __result(documents, globals, inputs, faker, chance, document_index) {\n    console.log(\"woohoo\");\n    \"contact_\" + this.contact_id;\n  }\n  return __result.apply(this, [].slice.call(arguments));\n}",
      },
      {
        name: 'object deconstruction',
        actual: 'const { countries } = inputs\nreturn `${this.contact_id}${countries[0]}`',
        expected: "function build(_documents, _globals, _inputs, _faker, _chance, _document_index) {\n  function __result(documents, globals, inputs, faker, chance, document_index) {\n    var countries = inputs.countries;\n  \n    return \"\" + this.contact_id + countries[0];\n  }\n  return __result.apply(this, [].slice.call(arguments));\n}",
      },
    ];
    /* eslint-enable max-len, quotes */

    tests.forEach(({ name, actual: build, expected }) => {
      test(name, (t) => {
        let actual = { name, build };
        parseModelFunctions(actual, babel_config);
        actual = actual.build;
        t.is(typeof actual, 'function');
        t.is(actual.toString(), expected);
      });
    });
  });

  test('babel failed to compile', async (t) => {
    let actual = {
      file: __dirname,
      build: 'cons { countries } = woohoo\nreturn `${this.contact_id}${countries[0]}`',
    };
    const tester = () => parseModelFunctions(actual, babel_config);
    const error = t.throws(tester);
    t.is(error.message, `Failed to transpile build with babel in ${__dirname}\nunknown: Unexpected token, expected ; (2:7)`);
  });

  test('failed to create function', async (t) => {
    let actual = {
      file: __dirname,
      build: 'var shoot = "woohoo"',
    };
    const tester = () => parseModelFunctions(actual);
    const error = t.throws(tester);
    t.is(error.message, 'Function Error in model \'undefined\', for property: build, Reason: Unexpected token var');
  });

  test.group('functions are returning values correctly', (test) => {
    const tests = [
      'documents',
      'globals',
      'inputs',
      'faker',
      'chance',
      'document_index',
      'this',
    ];

    tests.forEach((name, i) => {
      const stub = tests.map((item) => null); // eslint-disable-line
      test(name, (t) => {
        stub[i] = name;
        const expected = `function build(_documents, _globals, _inputs, _faker, _chance, _document_index) {\n  function __result(documents, globals, inputs, faker, chance, document_index) {\n    return ${name} + \"[${i}]\";\n  }\n  return __result.apply(this, [].slice.call(arguments));\n}`; // eslint-disable-line max-len
        let actual = {
          name,
          build: `\`\$\{${name}\}[${i}]\``
        };
        parseModelFunctions(actual, babel_config);
        actual = actual.build;
        t.is(typeof actual, 'function');
        t.is(actual.toString(), expected);
        t.is(actual.apply(name, stub), `${name}[${i}]`);
      });
    });
  });
});

test.group('parseModelReferences', models((t, file) => {
  const model = to.clone(contents[file]);
  const original_model = to.clone(contents[file]);
  const pattern = /\.(schema|items).\$ref$/;
  const paths = utils.getPaths(model, pattern);
  parseModelReferences(model);
  t.plan(paths.length);
  for (let ref of paths) {
    let set_location = ref.replace(pattern, '');
    if (ref.includes('.items.')) {
      set_location += '.items';
    }
    const get_location = _.get(original_model, ref).replace(/^#\//, '').replace('/', '.');
    const expected = to.extend(to.clone(_.get(original_model, set_location)), _.get(original_model, get_location));
    const actual = _.get(model, set_location);

    const { error } = is.compile(expected).validate(actual);

    if (error) {
      t.fail(error);
    } else {
      t.pass();
    }
  }
}));

test.group('parseModelTypes', models((t, file) => {
  const model = to.clone(contents[file]);
  const pattern = /.*properties\.[^.]+(\.items)?$/;
  const paths = utils.getPaths(model, pattern);
  const to_check = [];
  for (let str of paths) {
    if (_.get(model, str).type == null) {
      to_check.push(str);
    }
  }

  parseModelTypes(model);

  for (let str of to_check) {
    t.is(_.get(model, str).type, 'null');
  }
}, models.files));

test.group('parseModelDefaults', models((t, file) => {
  const test_model = to.clone(contents[file]);
  const model = to.clone(contents[file]);
  const pattern = /^(.*properties\.[^.]+)$/;
  const paths = utils.getPaths(model, pattern);
  parseModelDefaults(model);

  test_model.data = to.extend({ min: 0, max: 0, count: 0 }, test_model.data || {});

  t.deepEqual(model.data, test_model.data, 'The data should be defaulted');
  t.is(model.data.min, test_model.data.min);
  t.is(model.data.max, test_model.data.max);
  t.is(model.data.count, test_model.data.count);

  for (let data_path of paths) {
    let property = _.get(model, data_path);
    t.is(typeof property, 'object');
    if (property.type === 'array' && property.items) {
      t.is(typeof property.items.data, 'object');
      t.is(typeof property.items.data.min, 'number');
      t.is(typeof property.items.data.max, 'number');
      t.is(typeof property.items.data.count, 'number');
    } else {
      t.is(typeof property.data, 'object');
    }
  }
}));

test.group('parseModelCount', (test) => {
  function getContext() {
    const obj = { data: { count: 0 } };

    obj.data.min = to.random(0, 100);
    obj.data.max = to.random(obj.data.min, 300);
    return obj;
  }

  test.group('uses passed count', (test) => {
    {
      const number = to.random(1, 100);
      test(`(${number}) over data.min and data.max settings`, (t) => {
        const obj = getContext();
        t.falsy(obj.data.count);
        parseModelCount(obj, number);
        t.truthy(obj.data.count);
        t.is(obj.data.count, number);
      });
    }
    {
      const number = to.random(1, 100);
      test(`(${number}) over over data.count setting`, (t) => {
        const obj = getContext();
        t.falsy(obj.data.count);
        obj.data.count = 200;
        parseModelCount(obj, number);
        t.truthy(obj.data.count);
        t.not(obj.data.count, 200);
        t.is(obj.data.count, number);
      });
    }
  });

  test('returns a typeof number when a string is passed in', (t) => {
    const obj = getContext();
    t.falsy(obj.data.count);
    parseModelCount(obj, '1');
    t.truthy(obj.data.count);
    t.is(obj.data.count, 1);
  });

  test('returns a 1 when "0" is passed in as the count override', (t) => {
    const obj = getContext();
    t.falsy(obj.data.count);
    parseModelCount(obj, '0');
    t.truthy(obj.data.count);
    t.is(obj.data.count, 1);
  });

  test('chooses random number', (t) => {
    const obj = getContext();
    t.falsy(obj.data.count);
    parseModelCount(obj);
    const actual = obj.data.count;
    t.truthy(actual);
    t.truthy(actual >= obj.data.min && actual <= obj.data.max);
  });

  test('uses data.count', (t) => {
    const obj = getContext();
    t.falsy(obj.data.count);
    const expected = obj.data.count = to.random(1, 100);
    parseModelCount(obj);
    t.truthy(obj.data.count);
    t.is(obj.data.count, expected);
  });

  test('returns 1 when nothing is set', async (t) => {
    const obj = { data: {} };
    parseModelCount(obj);
    t.truthy(obj.data.count);
    t.is(obj.data.count, 1);
  });

  test('doesn\'t do anything if no data keys exist', async (t) => {
    const obj = {};
    parseModelCount(obj);
    t.deepEqual(obj, {});
  });

  test('returns 1 when data is 0', async (t) => {
    const obj = {
      data: { min: 0, max: 0, count: 0 },
    };
    parseModelCount(obj);
    t.truthy(obj.data.count);
    t.is(obj.data.count, 1);
  });

  test.group(models((t, file) => {
    const model = to.clone(contents[file]);
    // const original_model = to.clone(contents[file]);
    parseModelDefaults(model);
    parseModelCount(model);
    for (let str of utils.getPaths(model, /^(?:.*\.items\.data|data)$/)) {
      let property = _.get(model, str);
      t.truthy(property.count > 0);
    }
  }, 0));
});

// log all the schema keys that still need to be done
test.after(models.todo);