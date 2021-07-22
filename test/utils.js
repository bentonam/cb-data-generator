/* eslint-disable func-names, babel/object-shorthand */

var joi = require('joi');
var to = require('to-js');
to = to.default;
var p = require('path').join;
var _ = require('lodash');
var globby = require('globby');
var chalk = require('chalk');
var reduce = require('async-array-methods').reduce;
var fs = require('fs-extra-promisify');
var yaml = require('yamljs');
var json = require('jsondiffpatch');

/* istanbul ignore next: testing util */
/// @name models
/// @description This will setup the models function
/// @arg {object} settings
/// ```js
/// {
///   root: process.cwd(), // the root of the modules that are being tested
///   modules: '', // The path to the modules to test
///   // the function to get the validation file for the model
///   validation: function(model) {
///     return model.replace(/models(.*)\.yaml/g, 'validation$1.data.js');
///   },
///   // default match if match isn't passed to the individual tests
///   match: null,
///   // default todo list if match isn't passed to the individual tests
///   todo: [],
/// }
/// ```
/// @returns {function} - function that loops over each model that was found
module.exports.models = function(settings) {
  settings = to.extend({
    root: process.cwd(), // the root of the modules that are being tested
    modules: '', // The path to the modules to test
    // the function to get the validation file for the model
    validation: function(model) {
      return model.replace(/models(.*)\.yaml/g, 'validation$1.data.js');
    },
    match: null,
    todo: [],
  }, settings || {});

  settings.modules = globby.sync(settings.modules, { cwd: settings.root });

  // variable to store schemas so that after they've been required once
  // they don't have to be required again. The keys are the same as the model path
  // starting from `fakeit_root`.
  var schemas = {};

  ///# @name Each model
  ///# @description
  ///# This will loop through each of the models in the `fakeit_root` to run tests for each one.
  ///# It makes it easier to test each model against the different types of functionality.
  ///# @arg {function} cb - The function that's used to test each of the models
  ///# @arg {number, string, array, object} match [null]
  ///# If you only want certain tests to run you can pass in a number which will match the index of the item.
  ///# If you pass in a string it will only run the test that matches the string.
  ///# If you pass in an array it will only run the tests that match an item in the array.
  ///# If you pass in an object you must use `match`, `todo`, `run` as the keys.
  ///# The items in the array can either be numbers or strings
  ///# @arg {array, string} todo [[]] - The models todo
  ///# @arg {boolean} run [true] - Determins if the models should run
  ///#
  ///# @returns {function} -
  ///# This is the main group function that will create a new group test for you.
  ///# This is something that runs automatically, but if for some reason you have other tests
  ///# in your group you'll need to trigger it and pass in the `test` variable to it.
  ///#
  ///# @markup {js} Example
  ///# import test from 'ava-spec'
  ///# import { stdout } from 'test-console'
  ///#
  ///# test.group('console', models(async (t, model) => {
  ///#   // `t` is the assertion object for each test
  ///#   // `model` is the current model being run
  ///#
  ///#   t.context.defaults.output = 'console'
  ///#
  ///#   const inspect = stdout.inspect()
  ///#   await t.context.fakeit.generate(model, t.context.defaults)
  ///#   inspect.restore()
  ///#   const actual = to.object(stripAnsi(inspect.output[2].trim()))[0]
  ///#
  ///#   // make sure that you return the actual result
  ///#   // because it will be run through validation
  ///#   return actual
  ///# }))
  function models(cb, match, todo, run) {
    var options = to.arguments.apply(null, [
      { match: null, todo: [], run: true },
      match != null ? match : settings.match,
      todo != null ? todo : settings.todo,
      run != null ? run : true,
    ].slice(0, to.array(arguments).length));

    options.todo = to.array(options.todo);

    return function(test) {
      if (!options.run) return;
      // loop over all the globs
      settings.modules.forEach(function(model) {
        // check if there's a matching test
        const should_test = options.match === null ? true : !!to.flatten([ options.match ]).map(function(item) { // eslint-disable-line
          if (typeof item === 'number') {
            item = settings.modules[item];
          }

          return !!item && item.indexOf(model) >= 0;
        }).filter(Boolean).length;

        // if the model isn't in the todo list then run the tests
        if (
          should_test && options.todo.indexOf(model) < 0
        ) {
          var schema;
          // get the schema to use for validating that the output is correct
          try {
            schemas[model] = schema = schemas[model] || require(p(settings.root, settings.validation(model)));
          } catch (e) {
            schemas[model] = schema = {};
          }

          // eslint-disable-next-line no-underscore-dangle
          const schema_keys = schema.isJoi ? _.map(schema._inner.children, 'key') : to.keys(schema);

          if (model.indexOf('flight-data') >= 0) {
            test = test.serial;
          }

          test(model, function(t) { // eslint-disable-line
            // run the call back with the `t` assertion object and the current model
            var result = cb(t, model);

            if (!result) {
              return;
            }

            if (typeof result.then !== 'function') {
              result = Promise.resolve(result);
            }

            // assume that the callback will return a promise
            return result
              .then(function(actual) {
                if (!actual) {
                  return;
                }

                // find the keys that still need to be validated
                var omitted = _.difference(to.keys(actual), schema_keys)
                  .filter(function(key) {
                    return [ '__key', '__name' ].indexOf(key) < 0;
                  });
                // test the keys that exsit
                var picked = _.pick(actual, schema_keys);

                // if there're any keys that still need validation add them
                // to the schema_keys to test at the end
                if (omitted.length) {
                  var key = t.title.replace('fakit generate', '').trim();
                  models.schemas_todo[key] = omitted;
                }

                // validate the object that can be validated
                function validate(err) {
                  if (err) {
                    var segments = err.message.match(/(?:child\s+(?:"))([^"]+)(?:")/g);
                    if (segments) {
                      segments = segments.map(function(segment) {
                        return segment.replace(/child\s+|"/g, '');
                      });
                      var item_path = segments.join('.');
                      var item = _.get(picked, item_path);
                      if (item) {
                        console.log('   ', item_path, '=', item);
                      } else {
                        console.log('   path:', item_path);
                      }
                    }
                    t.fail(`${model} isn't valid ${err.message}`);
                  } else {
                    t.pass(`${model} is valid`);
                  }
                }

                schema.validate(picked, validate);
              })
              .catch(function(err) {
                console.log(`UTILS ERROR: ${JSON.stringify(err)}`);
                console.log(`UTILS ERROR MESSAGE: ${JSON.stringify(err.message)}`);
                console.log(`UTILS ERROR STACK: ${JSON.stringify(err.stack)}`);
                t.fail(err.message);
              });
          });
        } else if (
          options.match === null &&
          options.todo.indexOf(model) > -1
        ) {
          // if there's no specific match to test at they're
          // on the todo list then add that model to todo tests
          test.todo(model);
        }
      });
    };
  };

  models.files = settings.modules;
  models.schemas_todo = {};

  // this reads each of the models and parses the yaml string
  // then stores it on an object by it's file name
  // this can be used so you don't have to continually read the model files
  models.getContents = function getContents() {
    return reduce(models.files, function(prev, next) {
      return fs.readFile(p(settings.root, next))
        .then(function(contents) {
          prev[next] = yaml.parse(to.string(contents));
          return prev;
        });
    }, {});
  };

  models.todo = function() {
    for (var schema in models.schemas_todo) { // eslint-disable-line
      for (var i = 0; i < models.schemas_todo[schema].length; i++) {
        console.log(chalk.blue('  -', schema + ':', models.schemas_todo[schema][i]).toString());
      }
    }
  };

  return models;
};


// this works the same as objectSearch
/* istanbul ignore next: testing util */
module.exports.getPaths = function getPaths(model, regex) {
  return to.keys(model).concat(to.keys(to.flatten(model)))
    .reduce((result, next) => {
      var current = '';
      for (var key of next.split('.')) {
        current = current.split('.').concat(key).filter(Boolean).join('.');
        if (regex == null || regex.test(current)) {
          if (result.indexOf(current) < 0) {
            result.push(current);
          }
        }
      }
      return result;
    }, [])
    .map((str) => str.replace(/\.([0-9]+)(\.?)/, '[$1]$2'));
};

/// @name checkDiff
/// @description This is used to check and see if there's a difference between 2 different objects
/// @arg {object} actual - The actual object
/// @arg {object} expected - The expected object
/// @returns {string} If the string is empty then there was no diff, else it returns the formatted difference between the objects.
/* istanbul ignore next: testing util */
module.exports.checkDiff = function checkDiff(actual, expected) {
  const delta = json.diff(actual, expected);
  const spaces = '  ';
  const diff = json.formatters.console.format(delta).split('\n').map((line) => spaces + spaces + line).join('\n');
  if (!diff.trim()) {
    return '';
  }
  return diff;
};

/* istanbul ignore next: testing util */
module.exports.phone = joi.string().regex(/[0-9\(\)\-\s\.]+/);

/* istanbul ignore next: testing util */
module.exports.postal_code = joi.string().regex(/^[0-9]{5}(?:\-[0-9]{4})?$/).min(5).max(10);

/* istanbul ignore next: testing util */
module.exports.slug = joi.string().regex(/^[a-z][a-z-]+[a-z]$/);

/* istanbul ignore next: testing util */
module.exports.check = function check(type, description, data) {
  var result = {
    type: type
  };
  if (typeof description !== 'string') {
    data = description;
    description = null;
  }
  if (description) {
    result.description = description;
  }

  result.data = joi.object(data);

  return joi.object(result);
};
