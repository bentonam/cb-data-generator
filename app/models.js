import { map, forEach } from 'async-array-methods';
import fs from 'fs-extra-promisify';
import path from 'path';
import DependencyResolver from 'dependency-resolver';
import * as utils from './utils';
import Base from './base';
import { set, get, find, sortBy } from 'lodash';
import to, { is } from 'to-js';
import { transform } from '@babel/core';
import globby from 'globby';
import findRoot from 'find-root';

////
/// @name Models
/// @page api/models
////

export default class Models extends Base {
  constructor(options = {}) {
    super(to.extend({
      count: 0,
      seed: 0,
      babel_config: '+(.babelrc|package.json)',
    }, options));
    // holds all the inputs that are registerd
    this.inputs = {};

    this.models = []; // holds the parsed models

    this.registered_models = []; // holds the paths that have already been added

    this.prepared = false;
  }

  ///# @name prepare
  ///# @description
  ///# This is used to prepare the saving functionality that is determined by the
  ///# options that were passed to the constructor.
  ///# It sets a variable of `this.preparing` that ultimately calls `this.setup` that returns a promise.
  ///# This way when you go to save data it, that function will know if the setup is complete or not and
  ///# wait for it to be done before it starts saving data.
  ///# @returns {promise} - The setup function that was called
  ///# @async
  prepare() {
    this.preparing = true;
    this.preparing = this.setup();
    return this.preparing;
  }

  ///# @name setup
  ///# @description
  ///# This is used to setup the saving function that will be used.
  ///# @async
  async setup() {
    // if this.prepare hasn't been called then run it first.
    if (this.preparing == null) {
      return this.prepare();
    }

    let { babel_config } = this.options;

    if (!is.string(babel_config)) {
      process.nextTick(() => {
        this.prepared = true;
      });
      return;
    }

    let file = [ process.cwd(), this.options.root ]
      .reduce((prev, next) => {
        try {
          return prev.concat(path.join(findRoot(next), babel_config));
        } catch (e) {
          return prev;
        }
      }, []);

    file = await globby(to.unique(file), { dot: true });
    file = file[0];

    if (file) {
      let config = await fs.readJson(file);
      if (file.includes('package.json')) {
        config = config.babelConfig || {};
      }

      this.options.babel_config = config;
    }

    this.prepared = true;
  }

  ///# @name update
  ///# @description
  ///# This updates the progress spinner to show how many models have been parsed and how many are left
  update() {
    this.progress.text = `Models (${this.models.length}/${this.registered_models.length})`;
  }

  /// @name filterModelFiles
  /// @description This is used to filter out valid and unregistered model files
  /// @returns {array}
  filterModelFiles(files) {
    return to.flatten(files).filter((file) => {
      return !!file && /\.(ya?ml)$/i.test(file) && !this.registered_models.includes(file);
    });
  }

  async registerModels(models, dependency = false) {
    this.progress = this.progress || this.spinner('Models').start();
    // if models weren't passed in then don't do anything
    if (!models) {
      return;
    }

    /* istanbul ignore if */
    if (this.prepared !== true) {
      if (this.preparing == null) {
        this.prepare();
      }
      await this.preparing;
    }

    // get list of files
    const files = this.filterModelFiles(await utils.findFiles(this.resolvePaths(models)));

    // if no modle files are found
    if (!files.length) {
      // If the models being registered aren't dependencies then throw an error
      if (!dependency) {
        throw new Error('No valid model files found.');
      }
      return;
    };

    await forEach(files, async (file) => {
      // if the model aready exists then return
      if (this.registered_models.includes(file)) {
        if (!dependency) {
          const model = find(this.models, [ 'file', file ]);
          model.is_dependency = dependency;
        }
        return;
      }

      // add it to the models
      this.registered_models.push(file);
      this.update();

      // read yaml file and convert it to json
      const model = await utils.parsers.yaml.parse(to.string(await fs.readFile(file)));
      // used for debugging
      model.file = file;

      // sets the root of the model so that we can resolve inputs and dependencies later
      model.root = path.resolve(this.options.root, path.dirname(model.file));

      // used to determine if something is a dependency or not.
      if (model.is_dependency == null) {
        model.is_dependency = dependency;
      }

      /* istanbul ignore if : currently hard to test */
      if (!model.name) {
        model.name = path.basename(file).split('.')[0];
      }

      // validate the model
      /* istanbul ignore if : currently hard to test */
      if (!model.type) {
        this.log('error', new Error(`The model ${model.name} must have a "type" property.`));
      }

      /* istanbul ignore if : currently hard to test */
      if (!model.key) {
        this.log('error', new Error(`The model ${model.name} must have a "key" property.`));
      }

      // add the parsed model to the global object should always have a model name
      await this.parseModel(model);
      this.models.push(model);
      this.update();
    })
      .catch((err) => {
        this.progress.fail(err);
      });

    // update the models order
    this.models = resolveDependenciesOrder(this.models);
    this.models = resolveDependants(this.models);

    if (this.models.length === this.registered_models.length) {
      this.progress.stop();
    }
    return this;
  }

  ///# @name parseModel
  ///# @description
  ///# This is used to parse the model that was passed and add the functions, and fix the types, data, and defaults
  ///# @arg {object} model - The model to parse.
  ///# @returns {object} - The model that's been updated
  async parseModel(model) {
    // resolve the input paths
    parseModelDefaults(model);
    model.data.inputs = this.resolvePaths(model.data.inputs, model.root);
    // resolve the dependencies paths
    model.data.dependencies = this.resolvePaths(model.data.dependencies, model.root);
    const inputs = parseModelInputs(model);
    const dependencies = this.parseModelDependencies(model);
    parseModelFunctions(model, this.options.babel_config);
    parseModelReferences(model);
    parseModelTypes(model);
    parseModelCount(model, this.options.count);
    parseModelSeed(model, this.options.seed);

    // add this models inputs to the main inputs object
    this.inputs = Object.assign(this.inputs || {}, await inputs);
    await dependencies;
    return model;
  }

  ///# @name parseModel
  ///# @description
  ///# This is used to parse model dependencies if they have any
  ///# @arg {object} model - The model to parse.
  ///# @async
  async parseModelDependencies(model) {
    if (
      !model.data.dependencies ||
      !model.data.dependencies.length
    ) {
      model.data.dependencies = [];
      return;
    }

    // get list of files, flatten the array of files and filter files for valid input formats: yaml
    const files = to.flatten(await utils.findFiles(model.data.dependencies));

    if (!files.length) {
      model.data.dependencies = [];
      return;
    }

    await this.registerModels(files, true);
  }
}


/// @name parseModelInputs
/// @description
/// This is used to parse files that are used to generate specific data
/// @arg {object} model - The model to parse
/// @returns {object}
/// @async
/// @note {5} The `model.data.input` paths must already be resolved to be a absolute path.
export async function parseModelInputs(model) {
  if (
    !model.data.inputs ||
    !model.data.inputs.length
  ) {
    model.data.inputs = [];
    return {};
  }

  const inputs = {};

  // get list of files, flatten the array of files and filter files for valid input formats: csv, json, cson, yaml and zip
  let files = to.flatten(await utils.findFiles(model.data.inputs))
   .filter((file) => !!file && /\.(csv|json|cson|ya?ml|zip)$/i.test(file));

  if (!files.length) throw new Error(`No valid input files found for ${model.file}`);

  // loop over all the files, read them and parse them if needed
  files = await utils.readFiles(files);

  // handles parsing each of the supported formats
  await map(files, async (file) => {
    // get the current parser to use
    const parser = utils.parsers[file.ext.replace(/^\./, '')];

    if (!parser) throw new Error(`No valid parser could be found for "${file.name}.${file.type}"`);

    inputs[file.name] = await parser.parse(file.content);
    return file;
  });

  return inputs;
}

/// @name parseModelFunctions
/// @description
/// searches the model for any of the pre / post run and build functions and generates them
/// @arg {object} model - The model to update
/// @arg {string, object} babel_config [{}] - The configuration to use for babel
export function parseModelFunctions(model, babel_config = {}) {
  const paths = utils.objectSearch(model, /((pre|post)_run)|(pre_|post_)?build$/);
  paths.forEach((function_path) => {
    let name = to.camelCase(function_path);

    // get the function
    let fn = get(model, function_path).trim().split('\n').filter(Boolean);

    // if it's a single line function then ensure that the value is returned
    // just like normal es6 arrow functions
    if (fn.length === 1) {
      fn = [ `return ${fn[0].replace(/^return\s+/, '')}` ];
    }

    // indent each line and create a string
    fn = fn.map((line) => `  ${line}`).filter(Boolean).join('\n');

    // wrap the users function in the function we're going to use to trigger their function
    fn = `function __result(documents, globals, inputs, faker, chance, document_index, require) {\n${fn}\n}`;

    // if a babel config exists then transform the function
    if (
      is.plainObject(babel_config) &&
      !is.empty(babel_config)
    ) {
      try {
        // transform the function and remove the `'use strict';\n` part that babel adds if it exists
        fn = transform(fn, babel_config).code.replace(/^.use strict.;\n+/, '');
      } catch (e) {
        const file_message = model.file ? ` in ${model.file}` : '';
        e.message = `Failed to transpile ${function_path} with babel${file_message}\n${e.message}`.trim();
        throw e;
      }
    }

    // create the main function that will be run.
    /* eslint-disable indent */
    fn = [
      `function ${name}(_documents, _globals, _inputs, _faker, _chance, _document_index, _require) {`,
        // indent each line and create a string
        fn.split('\n').map((line) => `  ${line}`).filter(Boolean).join('\n'),
        '  return __result.apply(this, [].slice.call(arguments));',
      '}'
    ].join('\n');
    /* eslint-enable indent */

    try {
      set(model, function_path, new Function('require', 'process', `return ${fn}`)(require, process)); // eslint-disable-line no-new-func
    } catch (e) {
      throw new Error(`Function Error in model '${model.name}', for property: ${function_path}, Reason: ${e.message}`);
    }
  });
}

/// @name parseModelReferences
/// @description
/// searches the model for any '$ref' values that are pointing to definitions,
/// sub_models, etc. and copies the reference to the schema
/// @arg {object} model - The model to update
export function parseModelReferences(model) {
  const pattern = /\.(schema|items).\$ref$/;
  // sort the array so definitions come first before properties, this allows definitions to have definitions
  const paths = utils.objectSearch(model, pattern).sort();
  for (let ref of paths) {
    let set_location = ref.replace(pattern, '');
    if (ref.includes('.items.')) {
      set_location += '.items';
    }
    const original_property = get(model, set_location);
    const get_location = get(model, ref).replace(/^#\//, '').replace('/', '.');
    const updated_property = to.extend(to.clone(original_property), get(model, get_location));
    set(model, set_location, updated_property);
  }
}

/// @name parseModelTypes
/// @description
/// Searches the model for any properties or items and makes
/// sure the default types exist
/// @arg {object} model - The model to update
export function parseModelTypes(model) {
  for (let type_path of utils.objectSearch(model, /.*properties\.[^.]+(\.items)?$/)) {
    const property = get(model, type_path);
    // make sure there is a type property set
    if (property.type == null) {
      property.type = 'null';
      set(model, type_path, property);
    }
  }
}

/// @name parseModelTypes
/// @description
/// Sets any model defaults that are not defined
/// @arg {object} model - The model to update
export function parseModelDefaults(model) {
  // make sure it has the defaults for min, max, count
  model.data = to.extend({ min: 0, max: 0, count: 0 }, model.data);

  // find properties or items that do not have a data block and assign it
  for (let data_path of utils.objectSearch(model, /^(.*properties\.[^.]+)$/)) {
    let property = get(model, data_path) || {};
    // if it's an array and has items ensure it has defaults
    if (property.type === 'array' && property.items) {
      property.items = to.extend({ data: { min: 0, max: 0, count: 0 } }, property.items);
    } else {
      property = to.extend({ data: {} }, property);
    }

    set(model, data_path, property);
  }
}


/// @name parseModelCount
/// @description Determines the total number of documents to run
/// @arg {object} model - The model to update
/// @arg {undefined, null, number} count - The count to override the model settings
export function parseModelCount(model, count) {
  let value = to.number(count);
  const { data } = model;

  if (!value) {
    if (data.count > 0) {
      value = data.count;
    } else if (!!data.min && !!data.max) {
      value = to.random(data.min, data.max);
    }
  }

  // if count is null or 0 then set it to 1
  if (!value) {
    value = 1;
  }
  model.data.count = value;
}


/// @name parseModelSeed
/// @description Resolves the seed that was passed in
/// @arg {object} model - The model to update
/// @arg {undefined, null, number, string} seed - The seed to override the model settings
/// @note {2} - The resolved seed will either be null or a number since faker requires the seed to be a number
export function parseModelSeed(model, seed) {
  model.seed = !!seed ? seed : model.seed;

  if (typeof model.seed === 'string') {
    seed = '';
    for (let char of model.seed) {
      seed += char.charCodeAt(0);
    }
    model.seed = parseInt(seed);
  }
}

/// @name resolveDependenciesOrder
/// @description Resolves the dependency order that file models need to run in.
/// @arg {array} models [[]] - The models to prioritize
/// @returns {array} - The models are returned in order with all the models that don't have dependencies first
export function resolveDependenciesOrder(models = []) {
  if (models.length <= 1) {
    return models;
  }

  const resolver = new DependencyResolver();
  const order = {};

  function sortByFunction(item) {
    return item.data.dependencies.length;
  }
  models = sortBy(models, [ sortByFunction ]);

  for (let [ i, { file, data } ] of to.entries(models)) {
    order[file] = i;
    resolver.add(file);
    const dependencies = to.array(data && data.dependencies);
    for (let dependency of dependencies) {
      resolver.setDependency(file, dependency);
    }
  }

  return resolver.sort().map((file) => models[order[file]]);
}


/// @name resolveDependenciesOf
/// @description Figures out which models use the model as a dependency
/// @arg {array} models [[]] - The models to loop over
/// @returns {array} - The models are returned with the `dependants`
export function resolveDependants(models = []) {
  return models.map((model) => {
    // loop over each model and find out which other models depend on the current model
    model.dependants = models.reduce((prev, next) => {
      if (
        // the next file in the loop doesn't matche the current models file
        model.file !== next.file &&
        // the next models dependencies includes the current models files
        next.data.dependencies.includes(model.file)
      ) {
        prev.push(next.file);
      }
      return prev;
    }, []);

    return model;
  });
}
