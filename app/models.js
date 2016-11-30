import { map } from 'async-array-methods';
import fs from 'fs-extra-promisify';
import path from 'path';
import DependencyResolver from 'dependency-resolver';
import * as utils from './utils';
import Base from './base';
import objectPath from 'object-path';
import to from 'to-js';


export default class Models extends Base {
  constructor(options = {}) {
    super(options);
    this.models = []; // holds the parsed models
  }

  async registerModels(models) {
    // get list of files
    let files = await utils.findFiles(this.resolvePaths(models));
    // flattens the array of files and filter files for valid input formats: csv, json, cson, yaml and zip
    files = to.flatten(files).filter((file) => !!file && /\.ya?ml$/i.test(file));

    if (!files.length) throw new Error('No valid model files found.');

    this.models = await map(files, async (file) => {
      // read yaml file and convert it to json
      const model = await utils.parsers.yaml.parse(to.string(await fs.readFile(file)));

      if (!model.name) {
        model.name = path.basename(file).split('.')[0];
      }

      // validate the model
      if (!model.type) {
        this.log('error', new Error(`The model ${model.name} must have a "type" property.`));
      }
      if (!model.key) {
        this.log('error', new Error(`The model ${model.name} must have a "key" property.`));
      }

      // add the parsed model to the global object should always have a model name
      return this.parseModel(model);
    });

    // update the models order
    this.models = resolveDependenciesOrder(this.models);

    return this;
  }

  ///# @name parseModel
  ///# @description
  ///# This is used to parse the model that was passed and add the functions, and fix the types, data, and defaults
  ///# @returns {object} - The model that's been updated
  parseModel(model) {
    parseModelFunctions(model);
    parseModelReferences(model);
    parseModelTypes(model);
    parseModelDefaults(model);
    parseModelCount(model, this.options.count || this.options.number);
    return model;
  }
}

// searches the model for any of the pre / post run and build functions and generates them
export function parseModelFunctions(model) {
  // console.log('models.parseModelFunctions');
  const paths = utils.objectSearch(model, /((pre|post)_run)|(pre_|post_)?build$/);
  paths.forEach((function_path) => {
    try {
      objectPath.set(
        model,
        function_path,
        /* eslint-disable no-new-func */
        new Function('documents', 'globals', 'inputs', 'faker', 'chance', 'document_index', objectPath.get(model, function_path))
        /* eslint-enable no-new-func */
      );
    } catch (e) {
      throw new Error(`Function Error in model '${model.name}', for property: ${function_path}, Reason: ${e.message}`);
    }
  });
}

// searches the model for any '$ref' values that are pointing to definitions, sub_models, etc. and copies the reference to the schema
export function parseModelReferences(model) {
  // console.log('models.parseModelReferences');
  const pattern = /\.(schema|items).\$ref$/;
  utils.objectSearch(model, pattern)
    .sort() // sort the array so definitions come first before properties, this allows definitions to have definitions
    .forEach((reference_path) => {
      const property_path = reference_path.replace(pattern, '') + (reference_path.includes('.items.') ? '.items' : '');
      let property = objectPath.get(model, property_path);
      const defined_path = objectPath.get(model, reference_path).replace(/^#\//, '').replace('/', '.');
      property = to.extend(to.clone(property), objectPath.get(model, defined_path));
      objectPath.set(model, property_path, property);
    });
}

// searches the model for any properties or items and makes sure the default types exist
export function parseModelTypes(model) {
  // console.log('models.parseModel_properties');
  utils.objectSearch(model, /.*properties\.[^.]+(\.items)?$/)
    .forEach((type_path) => {
      const property = objectPath.get(model, type_path);
      // make sure there is a type property set
      if (!property.hasOwnProperty('type')) {
        property.type = 'undefined';
        objectPath.set(model, type_path, property);
      }
    });
}

// sets any model defaults that are not defined
export function parseModelDefaults(model) {
  // console.log('models.parseModelDefaults');
  // find properties or items that do not have a data block and assign it
  utils.objectSearch(model, /^(.*properties\.[^.]+)$/)
    .forEach((data_path) => {
      let property = objectPath.get(model, data_path);
      // if the property is an array that has an items block but not a data block, default it
      if (property.type === 'array') {
        if (property.items && !property.items.data) {
          property.items.data = {};
        }
      } else if (!property.data) {
        property.data = {};
      }
      objectPath.set(model, data_path, property);
    });

  // find any data property at the root or that is a child of items and make sure it has the defaults for min, max, fixed
  if (!model.data) { // if a data property wasn't set define it
    model.data = {};
  }

  utils.objectSearch(model, /^(.*properties\.[^.]+\.items\.data|(data))$/)
    .forEach((data_path) => {
      objectPath.set(
        model,
        data_path,
        to.extend({ min: 0, max: 0, fixed: 0 }, objectPath.get(model, data_path))
      );
    });
}

export function parseModelCount(model, count) {
  if (!count) {
    count = model.data.fixed || to.random(model.data.min, model.data.max) || 1;
  }
  model.count = to.number(count);
}

export function resolveDependenciesOrder(models = []) {
  const resolver = new DependencyResolver();
  const order = {};

  for (let [ i, { name, data } ] of to.entries(models)) {
    order[name] = i;
    resolver.add(name);
    const dependencies = to.array(data && data.dependencies);
    for (let dependency of dependencies) {
      resolver.setDependency(name, dependency);
    }
  }

  return resolver.sort().map((name) => models[order[name]]);
}
