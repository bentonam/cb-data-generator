/* eslint-disable no-underscore-dangle */
/* eslint-disable no-undefined */

import Models, {
  parseModelInputs,
  parseModelFunctions,
  parseModelReferences,
  parseModelTypes,
  parseModelDefaults,
  parseModelCount,
  parseModelSeed,
  resolveDependenciesOrder,
} from '../dist/models.js';
import path, { join as p } from 'path';
import ava from 'ava-spec';
import to from 'to-js';
import Joi from 'joi';
import _ from 'lodash';
import fs from 'fs-extra-promisify';
import AdmZip from 'adm-zip';
const test = ava.group('models');
const models_root = p(__dirname, 'fixtures', 'models');
import { stdout } from 'test-console';
import stripAnsi from 'strip-ansi';
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


test('without args', (t) => {
  t.context.options.log = true;
  const expected = {
    // inherited from events-async
    domain: null,
    _events: {},
    _eventsCount: 0,
    _maxListeners: 50,

    options: {
      root: models_root,
      log: true,
      verbose: false,
      spinners: false,
      timestamp: true,
      count: 0,
      seed: 0,
      babel_config: '+(.babelrc|package.json)'
    },
    log_types: {
      error: 'red',
      info: 'blue',
      log: 'gray',
      success: 'green',
      verbose: 'magenta',
      warning: 'yellow'
    },
    inputs: {},
    models: [],
    prepared: false,
    registered_models: [],
    spinners: {},
  };

  t.deepEqual(t.context._events, expected._events);
  t.deepEqual(t.context._eventsCount, expected._eventsCount);
  t.deepEqual(t.context._maxListeners, expected._maxListeners);
  t.deepEqual(t.context.options, expected.options);
  t.deepEqual(t.context.log_types, expected.log_types);
  t.deepEqual(t.context.inputs, expected.inputs);
  t.deepEqual(t.context.models, expected.models);
  t.deepEqual(t.context.prepared, expected.prepared);
  t.deepEqual(t.context.registered_models, expected.registered_models);
  t.deepEqual(t.context.spinners, expected.spinners);
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


test.serial.group('setup', (test) => {
  test('babel_config as a string', async (t) => {
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

  test('babel_config as an object', async (t) => {
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    t.context.options.babel_config = babel_config;
    t.is(to.type(t.context.options.babel_config), 'object');
    const preparing = t.context.setup();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    // t.is(t.context.prepared, true);
    t.is(to.type(t.context.options.babel_config), 'object');
    t.deepEqual(t.context.options.babel_config, babel_config);
  });

  test('babel_config in the package.json', async (t) => {
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    t.context.options.babel_config = 'package.json';
    t.is(typeof t.context.options.babel_config, 'string');
    const preparing = t.context.setup();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.prepared, true);
    t.is(to.type(t.context.options.babel_config), 'object');
    t.deepEqual(t.context.options.babel_config, babel_config);
  });

  test('babel_config process.cwd failed to find a babel config', async (t) => {
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    t.context.options.root = t.context.options.root.split('fakeit')[0].slice(0, -1);
    t.context.options.babel_config = 'package.json';
    t.is(typeof t.context.options.babel_config, 'string');
    const preparing = t.context.setup();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.prepared, true);
    t.is(to.type(t.context.options.babel_config), 'object');
    t.deepEqual(t.context.options.babel_config, babel_config);
  });
});


test.group('registerModels', (test) => {
  test('without args', async (t) => {
    // you can run registerModels and nothing will happen
    try {
      await t.context.registerModels();
      t.pass();
    } catch (e) {
      t.fail();
    }
  });

  // throws error if this isn't defined
  test.todo('without model.type value');

  // throws error if this isn't defined
  test.todo('without model.key value');

  test.group(models(async (t, file) => {
    const original_model = to.clone(contents[file]);
    // min length of the models expected
    const min = (original_model.data.dependencies || []).length;
    // registerModel
    await t.context.registerModels(file);

    // ensure that the registered_models and models length is greater
    // than the min length. We can't check for exact length here because
    // a dependency might depend on other dependencies
    t.truthy(t.context.registered_models.length >= min);
    t.truthy(t.context.models.length >= min);
    file = t.context.resolvePaths(file)[0];
    const actual = _.find(t.context.models, [ 'file', file ]);
    const dependencies = _.without(t.context.models, actual);
    t.is(actual.is_dependency, false);
    t.is(actual.root, path.resolve(t.context.options.root, path.dirname(actual.file)));
    // ensure the dependencies are set as dependencies
    for (let dependency of dependencies) {
      t.is(dependency.is_dependency, true);
    }


    // helper to create test
    // for (let key in actual.properties) {
    //   if (actual.properties.hasOwnProperty(key)) {
    //     const property = actual.properties[key];
    //     let obj = '';
    //     let result = `utils.check('${property.type}', '${property.description}', `;
    //     for (var data_key in property.data) {
    //       if (property.data.hasOwnProperty(data_key)) {
    //         const data_property = property.data[data_key];
    //         let type = to.type(data_property);
    //         if (type === 'function') {
    //           type = 'func';
    //         }
    //         obj += `${data_key}: is.${type}(), `;
    //       }
    //     }
    //     result += `{ ${obj.trim()} })`;
    //     console.log(`    ${key}: ${result},`);
    //   }
    // }

    return actual;
  }));

  test.serial('fails when filepath that was passed doesn\'t exist', async (t) => {
    const inspect = stdout.inspect();
    await t.context.registerModels('lol/i/do/not/exist.yaml')
      .then(() => t.fail())
      .catch(() => t.pass());
    inspect.restore();
    t.truthy(/^\[[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}\]\s+.\s+error:$/.test(stripAnsi(inspect.output[0]).trim()));
    t.truthy(/ENOENT: no such file or directory/.test(inspect.output[1]));
  });
});


test('parseModel', (t) => {
  t.is(typeof t.context.parseModel, 'function');
});


test.group('filterModelFiles', (test) => {
  test('filter none', (t) => {
    t.deepEqual(t.context.registered_models, []);
    t.deepEqual(t.context.filterModelFiles([ 'foo.yaml', 'bar.yaml' ]), [ 'foo.yaml', 'bar.yaml' ]);
  });
  test('filter files that aren\'t yaml', (t) => {
    t.deepEqual(t.context.filterModelFiles([ 'foo.yaml', 'bar.yaml', 'baz.zip', 'qux.json', 'quxx.cson' ]), [ 'foo.yaml', 'bar.yaml' ]);
  });
  test('filter files that have been registered already', (t) => {
    t.context.registered_models.push('foo.yaml');
    t.deepEqual(t.context.filterModelFiles([ 'foo.yaml', 'bar.yaml', 'baz.zip', 'qux.json', 'quxx.cson' ]), [ 'bar.yaml' ]);
  });
});


test.group('parseModelDependencies', models(async (t, file) => {
  const model = to.clone(contents[file]);

  model.data.dependencies = t.context.resolvePaths(model.data.dependencies, path.resolve(t.context.options.root, path.dirname(file)));

  await t.context.parseModelDependencies(model);
  if (model.data.dependencies.length === 0) {
    t.plan(0);
  } else {
    const length = t.context.models.length;
    t.is(length, to.unique(t.context.registered_models).length);
  }

  let count = 0;

  function check(dependencies) {
    if (count++ >= 20) {
      t.fail('parseModelDependencies has ran too many checks');
      return;
    }

    for (let dependency_path of dependencies) {
      t.truthy(t.context.registered_models.includes(dependency_path));
      const dependency = _.find(t.context.models, [ 'file', dependency_path ]);
      if (dependency_path === file) {
        t.falsy(dependency.is_dependency);
      } else {
        t.truthy(dependency.is_dependency);
      }
      if (dependency.data.dependencies.length) {
        check(dependency.data.dependencies);
      }
    }
  }

  check(model.data.dependencies);
}));


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
    prev[path.basename(next).split('.')[0]] = Joi.any().allow(Joi.array(), Joi.object());
    return prev;
  }, {});

  const actual = await parseModelInputs(model);

  t.is(to.type(model.data.inputs), 'array');

  const tests = [ t.context.inputs, actual ];

  for (let item of tests) {
    const { error } = Joi.object(expected).validate(item);
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
    parseModelFunctions(obj, babel_config);

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
        expected: "function build(_documents, _globals, _inputs, _faker, _chance, _document_index, _require) {\n  function __result(documents, globals, inputs, faker, chance, document_index, require) {\n    return \"contact_\".concat(this.contact_id);\n  }\n  return __result.apply(this, [].slice.call(arguments));\n}",
      },
      {
        name: 'multi line doesn\'t have automatic return',
        actual: 'console.log("woohoo");\n`contact_${this.contact_id}`',
        expected: "function build(_documents, _globals, _inputs, _faker, _chance, _document_index, _require) {\n  function __result(documents, globals, inputs, faker, chance, document_index, require) {\n    console.log(\"woohoo\");\n    \"contact_\".concat(this.contact_id);\n  }\n  return __result.apply(this, [].slice.call(arguments));\n}",
      },
      {
        name: 'object deconstruction',
        actual: 'const { countries } = inputs\nreturn `${this.contact_id}${countries[0]}`',
        expected: "function build(_documents, _globals, _inputs, _faker, _chance, _document_index, _require) {\n  var _interopRequireDefault = require(\"@babel/runtime-corejs3/helpers/interopRequireDefault\");\n  \n  var _concat = _interopRequireDefault(require(\"@babel/runtime-corejs3/core-js-stable/instance/concat\"));\n  \n  function __result(documents, globals, inputs, faker, chance, document_index, require) {\n    var _context;\n  \n    var countries = inputs.countries;\n    return (0, _concat[\"default\"])(_context = \"\".concat(this.contact_id)).call(_context, countries[0]);\n  }\n  return __result.apply(this, [].slice.call(arguments));\n}",
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
    t.truthy(error.message.includes(`Failed to transpile build with babel in ${__dirname}\n`));
    t.truthy(error.message.includes('unknown: Missing semicolon'));
  });

  test('failed to create function', async (t) => {
    let actual = {
      file: __dirname,
      build: 'var shoot = "woohoo"',
    };
    const tester = () => parseModelFunctions(actual);
    const error = t.throws(tester);
    t.is(error.message, 'Function Error in model \'undefined\', for property: build, Reason: Unexpected token \'var\'');
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
        const expected = `function build(_documents, _globals, _inputs, _faker, _chance, _document_index, _require) {\n  function __result(documents, globals, inputs, faker, chance, document_index, require) {\n    return "".concat(${name}, \"[${i}]\");\n  }\n  return __result.apply(this, [].slice.call(arguments));\n}`; // eslint-disable-line max-len
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

    const { error } = Joi.compile(expected).validate(actual);

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
    const actual = obj.data.count;
    t.truthy(actual);
    t.truthy(actual >= obj.data.min && actual <= obj.data.max);
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
    parseModelDefaults(model);
    parseModelCount(model);
    t.truthy(model.data.count > 0);
    if (!!model.data.max) {
      t.truthy(model.data.count <= model.data.max);
      t.truthy(model.data.count >= model.data.min);
    }
  }));
});


test.group('parseModelSeed', (test) => {
  function toNumber(str) {
    let result = '';
    for (let char of str) {
      result += char.charCodeAt(0);
    }
    return parseInt(result);
  }

  test('uses passed seed abc', (t) => {
    const model = {};
    const seed = 'abc';
    parseModelSeed(model, seed);
    t.is(typeof model.seed, 'number');
    t.is(model.seed, toNumber(seed));
  });

  test('uses passed seed def when model has a seed set', (t) => {
    const original_seed = 'abc';
    const model = { seed: original_seed };
    const seed = 'def';
    parseModelSeed(model, seed);
    t.is(typeof model.seed, 'number');
    t.not(model.seed, toNumber(original_seed));
    t.is(model.seed, toNumber(seed));
  });

  test('set seed ghi', (t) => {
    const seed = 'ghi';
    const model = { seed };
    parseModelSeed(model);
    t.is(typeof model.seed, 'number');
    t.is(model.seed, toNumber(seed));
  });

  test('seed us set to null when it\'s not defined or passed', (t) => {
    const model = {};
    parseModelSeed(model);
    t.truthy(model.seed == null);
  });

  test('seed uses set number 123456789', (t) => {
    const model = { seed: 123456789 };
    parseModelSeed(model);
    t.is(model.seed, 123456789);
  });
});


test.group('resolveDependenciesOrder', (test) => {
  const tests = [];

  function create(title, actual = [], expected) {
    function createItem(item) {
      if (typeof item === 'number') {
        return actual[item];
      }
      item = to.array(item);
      return {
        file: item[0],
        data: { dependencies: item.slice(1) },
      };
    }
    actual = to.array(actual).map(createItem);
    expected = !expected ? actual : expected.map(createItem);
    tests.push({ title, actual, expected });
  }

  create('no models were passed');

  create('single model passed', 'one');

  create(
    'one level of dependencies already in order',
    [
      'one',
      [ 'two', 'one' ],
    ]
  );

  create('one level of dependencies in reverse order',
    // actual
    [
      [ 'one', 'two' ],
      [ 'two' ],
    ],
    // expected
    [ 1, 0 ],
  );

  create('one level of multiple dependencies',
    // actual
    [
      [ 'one', 'two', 'three' ],
      'two',
      'three',
    ],
    // expected
    [ 1, 2, 0 ],
  );

  create('multiple levels of dependencies',
    // actual
    [
      [ 'one', 'two' ],
      [ 'two', 'three' ],
      'three',
    ],
    // expected
    [ 2, 1, 0 ],
  );

  create('multiple levels of multiple dependencies',
    // actual
    [
      [ 'one', 'two', 'four' ],
      [ 'two', 'three' ],
      'three',
      'four',
    ],
    // expected
    [ 2, 3, 1, 0 ],
  );

  create('multiple levels of multiple dependencies reversed',
    // actual
    [
      'four',
      'three',
      [ 'two', 'three' ],
      [ 'one', 'two', 'four' ],
    ],
    // expected
    [ 0, 1, 2, 3 ],
  );

  create('multiple levels of multiple dependencies with same dependencies',
    // actual
    [
      [ 'one', 'two', 'four' ],
      [ 'two', 'three' ],
      [ 'three', 'four' ],
      [ 'four', 'five' ],
      'five',
      'six',
      'seven',
    ],
    // expected
    [ 4, 5, 6, 3, 2, 1, 0 ],
  );

  create('multiple levels of multiple dependencies with same dependencies variation',
    // actual
    [
      [ 'two', 'three' ],
      [ 'three', 'four' ],
      [ 'four', 'five' ],
      'five',
      'six',
      'seven',
      [ 'one', 'two', 'four' ],
    ],
    // expected
    [ 3, 4, 5, 2, 1, 0, 6 ],
  );

  tests.forEach(({ title, actual, expected }, i) => {
    test(`${title} (${i})`, (t) => {
      actual = resolveDependenciesOrder(actual);
      const diff = utils.checkDiff(actual, expected);
      if (diff) {
        t.fail(title);
      } else {
        t.pass();
      }
    });
  });
});

// log all the schema keys that still need to be done
test.after(models.todo);
