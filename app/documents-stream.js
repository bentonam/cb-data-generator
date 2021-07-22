let exit = false;
process.on('SIGINT', () => {
  exit = true;
  process.exit(2);
});

import faker from 'faker';
import Chance from 'chance';
import Base from './base';
import { objectSearch } from './utils';
import { set, get } from 'lodash';
import to from 'to-js';

import { Readable, Writable } from 'stream';


////
/// @name Documents
/// @page api/documents
////

/// @name DocumentsStream
/// @description This class is used to generate all the documents for the passed models
export default class DocumentsStream extends Base {
  constructor(options = {}, globals = {}, inputs = {}, output) { // eslint-disable-line max-params
    super(options);
    this.options = to.extend({ count: 0 }, this.options);
    this.globals = globals;
    this.inputs = inputs;
    this.total = 0;
    // set a reference to the output, really all we're going to use this for is
    // it's handle to the bucket
    this.output = output;
  }

  ///# @name build
  ///# @description
  ///# This takes an array of models and builds them
  ///# @arg {array} models - Array of models
  ///# @returns {array} of documents
  ///# @async
  build(models) {
    models = to.clone(models);
    const self = this; // hold reference to the instance
    let spinners = {};
    for (const { name } of models) {
      spinners[name] = this.spinner(name);
    }
    // get the next document to build and generate
    let current_model = models.pop();
    let current_model_document;
    const next = () => {
      // if the current model is undefined, we've successfully processed all of the items in the array
      if (!current_model) {
        return null;
      }
      // if we've generated all of the documents for a model, set the next model
      if (current_model_document && current_model_document.generated === current_model.data.count) {
        current_model_document.runData(current_model.data.post_run, current_model); // call the post run function
        spinners[current_model.name].stop(); // stop the spinner
        current_model = models.pop(); // get the next model
        current_model_document = null; // reset the model document builder
      }
      // if we have a model build it's next document and return it
      if (current_model) {
        // make sure we have a DocumentBuilder
        if (!current_model_document) {
          current_model_document = new DocumentBuilder(this.options, this.globals, this.inputs); // get a model document builder
          spinners[current_model.name].start();
          current_model_document.runData(current_model.data.pre_run, current_model); // call the pre_run function
        }
        return current_model_document.buildDocument(current_model); // return a built document
      }
    };
    // setup reader
    const reader = new Readable({
      read() {
        // if we should exist, just stop
        if (exit) {
          this.push(null);
          return;
        }
        this.push(next());
        if (current_model) {
          // eslint-disable-next-line max-len
          spinners[current_model.name].text = `${current_model.name} documents (${commaify(current_model_document.generated)} / ${commaify(current_model.data.count)})`;
          self.total += 1;
        }
      },
      objectMode: true,
    });
    // helper to properly display large #
    const commaify = (value) => {
      return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };
    // setup writer
    const writer = new Writable({
      write(chunk, encoding, callback) {
        // if we were passed more data than we actually needed, chunk is undefined, just call the callback
        if (!chunk) {
          callback();
          return;
        }
        self.output.outputter.bucket.upsert(chunk.__key, chunk, (err) => { // eslint-disable-line no-underscore-dangle
          callback(err); // notify that the data was processed regardlress of succes / failure
        });
      },
      objectMode: true,
      highWaterMark: 16, // default for object mode is 16
    });
    // pipe the streams together
    reader.pipe(writer);
    // return a process that will resolve when the writer has finished
    return new Promise((resolve, reject) => {
      // if either the reader or the writer errors reject the promise
      reader.on('error', (err) => {
        console.error('Reader Error:', err);
        reader.destroy(err);
        reject(err);
      });
      writer.on('error', (err) => {
        console.error('Writer Error:', err);
        reader.destroy(err);
        reject(err);
      });
      // resolve ones the writer finishes
      writer.on('finish', () => {
        self.inputs = {};
        self.globals = {};
        resolve([]);
      });
    });
  }
}

export class DocumentBuilder extends Base {
  constructor(options = {}, globals = {}, inputs = {}) {
    super(options);
    this.options = to.extend({ count: 0 }, this.options);
    this.globals = globals;
    this.inputs = inputs;
    // set chance and faker without a seed by default
    // so it can still be used
    this.chance = new Chance();
    this.faker = faker;
    this.generated = 0; // hold the number of generated documents
    this.updateFakers(this.options.seed);
  }

  ///# @name updateFakers
  ///# @description
  ///# If a usable seed is passed then this updates the instances of chance and faker to use a seed version
  ///# @arg {number, null} seed - The seed to use for this instance
  ///# @arg {number} modifier
  updateFakers(seed) {
    // if the seed is a number then update
    // the instance of chance and faker
    if (typeof seed === 'number') {
      this.chance = new Chance(seed);
      this.faker.seed(seed);
    }
  }

  ///# @name runData
  ///# @description used to run the different functions that the users can pass in into the data object
  ///# @arg {function} fn - The function to run
  ///# @arg {*} context - The `this` context
  ///# @arg {number} index [0] - The current index of the generated items
  ///# @returns {*} - What ever the function that runs returns
  runData(fn, context, index = 0) {
    if (to.type(fn) === 'function') {
      try {
        return fn.call(context, null, this.globals, this.inputs, this.faker, this.chance, index, require);
      } catch (e) {
        e.message = `${fn.name} failed, ${e.message}`;
        this.log('error', e);
      }
    }
  }

  ///# @name buildDocument
  ///# @description
  ///# builds a document
  ///# @arg {object} model - The model to build the document from
  ///# @arg {number} index [0] - The place in the list this item is being run from
  buildDocument(model, index = 0, sub_doc = false) {
    index = index || this.generated || 0;
    const key_type = to.type(model.key);
    const paths = getPaths(model);
    // generate the initial values
    let doc = this.initializeDocument(model, paths);

    // if there is a pre_build function for the document call it
    this.runData(model.data.pre_build, doc, index);

    doc = this.buildObject(model, doc, paths, index);
    doc = this.postProcess(model, doc, paths, index);

    // if there is a post_build function for the document call it
    this.runData(model.data.post_build, doc, index);

    // build the key for the document
    let key;
    if (key_type === 'object') {
      model.key.data = model.key.data || {};
      key = this.buildValue(model.key, typeToValue(model.key.type), doc, index);
    } else if (key_type === 'string') {
      key = get(doc, model.key);
    }
    key = key || `${model.name}_${index}`;

    // TODO: update this to use `new Map`, or `new WeakMap`;
    Object.defineProperty(doc, '__key', { value: key });
    Object.defineProperty(doc, '__name', { value: model.name });

    // only increment the generated if we're dealing with the parent document, not nested objects
    if (!sub_doc) {
      this.generated += 1;
    }
    return doc;
  }

  ///# @name initializeDocument
  ///# @description initializes a documents default values
  ///# @arg {object} model - The model to parse
  ///# @arg {object} paths - The paths to loop over
  ///# @returns {object} - The document with the defaults
  initializeDocument(model, paths) {
    if (!paths || !paths.model || !paths.document) {
      paths = getPaths(model);
    }
    const doc = {};
    for (let [ i, str ] of to.entries(paths.model)) {
      let key = paths.document[i]; // set a key for error messaging
      try {
        set(doc, key, typeToValue(get(model, str).type));
      } catch (e) {
        this.log('error', `Initializing Properties in Model: "${model.name}" for Key: "${key}"\n`, e);
      }
    }
    return doc;
  }

  ///# @name buildObject
  ///# @description builds an object based on a model
  ///# @arg {object} model - The model to parse
  ///# @arg {object} doc - The document to update
  ///# @arg {object} paths - The paths to loop over
  ///# @arg {number} index - The current index
  ///# @returns {object} - The document with the defaults
  buildObject(model, doc, paths, index) {
    for (let [ i, str ] of to.entries(paths.model)) {
      let key = paths.document[i]; // set a key for error messaging
      try {
        const value = this.buildValue(get(model, str), get(doc, key), doc, index);
        set(doc, key, value);
      } catch (e) {
        this.log('error', `Building Properties in Model: "${model.name}" for Key: "${key}"\n`, e);
      }
    }

    return doc;
  }

  ///# @name buildValue
  ///# @description builds a single value based on a property definition
  ///# @arg {object} property - The property to run
  ///# To build a normal value
  ///# ```js
  ///# {
  ///#   type: '',  // 'object', 'structure', 'string', 'number', 'float', 'integer', etc..
  ///#   data: {
  ///#     pre_build() {}, // optional
  ///#     value: '', // optional
  ///#     build() {}, // optional
  ///#     fake: '', // optional
  ///#   }
  ///# }
  ///# ```
  ///# To build an array
  ///# ```js
  ///# {
  ///#   type: 'array',
  ///#   items: {
  ///#     type: '',  // 'object', 'structure', 'string', 'number', 'float', 'integer', etc..
  ///#     data: {
  ///#       pre_build() {}, // optional
  ///#       value: '', // optional
  ///#       build() {}, // optional
  ///#       fake: '', // optional
  ///#     }
  ///#   }
  ///# }
  ///# ```
  ///# @arg {*} value - The default value
  ///# @arg {object} doc [{}] - The current document
  ///# @arg {number} index [0] - The place in the list this item is being run from
  ///# @return {*} - The result
  buildValue(property, value, doc = {}, index = 0) {
    if (property.data) {
      if (property.data.pre_build) {
        value = this.runData(property.data.pre_build, doc, index);
      }
      if (property.data.value) {
        return property.data.value;
      } else if (property.data.build) {
        return this.runData(property.data.build, doc, index);
      } else if (property.data.fake) {
        return this.faker.fake(property.data.fake);
      }
    } else if (
      property.type === 'array' &&
      property.items
    ) {
      let { count, min, max } = property.items.data;
      if (count <= 0 && !!max) {
        count = this.chance.integer({ min, max });
      }

      // builds a complex array
      if (property.items.type === 'object') {
        for (let i = 0; i < count; i++) {
          value[i] = this.buildDocument(property.items, index, true);
        }
        return value;
      }

      // builds a simple array
      for (let i = 0; i < count; i++) {
        const result = this.buildValue(property.items, typeToValue(property.items.type), doc, index);
        if (result !== undefined) { // eslint-disable-line no-undefined
          value.push(result);
        }
      }
      return value;
    }

    return value;
  }

  ///# @name postProcess
  ///# @description Post process a document after generation
  ///# @arg {object} model - The model to parse
  ///# @arg {object} doc - The document to update
  ///# @arg {object} paths - The paths to loop over
  ///# @arg {number} index [0] - The current index
  ///# @returns {object} - The updated document
  postProcess(model, doc, paths, index = 0) {
    for (let [ i, str ] of to.entries(paths.model)) {
      let key = paths.document[i]; // set a key for error messaging
      try {
        const { data = {}, items = {}, type } = get(model, str);
        let value = get(doc, key);

        // if there is a post_build block
        if (data.post_build) {
          let temp = this.runData(data.post_build, doc, index);
          if (temp != null) {
            value = temp;
          }
        } else if (
          (items.data || {}).post_build &&
          items.type !== 'object' // if the type is an object it will run each item through this function already
        ) {
          for (let a = 0; a < value.length; a++) {
            let temp = transformValueToType(items.type, this.runData(items.data.post_build, doc[key][a], index));
            if (temp != null) {
              value[a] = temp;
            }
          }
        }

        set(doc, key, transformValueToType(type, value));
      } catch (e) {
        this.log('error', `Transforming Properties in Model: "${model.name}" for Key: "${key}"\n`, e);
      }
    }

    return doc;
  }
}

/// @name transformValueToType
/// @description This will transform a value to the correct type
/// @arg {string} type - The type to convert the value to
/// @arg {*} value - The actual value
/// @returns {*} - The converted value
export function transformValueToType(type, value) {
  if (
    type == null ||
    value == null ||
    type === 'array'
  ) {
    return value;
  }

  // if it is an integer make sure it is treated as such
  if ('number,integer,long'.includes(type)) {
    return parseInt(value);
  }
  // if it is a double / float make sure it is treated as such
  if ('double,float'.includes(type)) {
    return parseFloat(value);
  }

  // if it is a string make sure it is treated as such
  if (type === 'string') {
    return value.toString();
  }

  // if it is a string make sure it is treated as such
  if ('boolean,bool'.includes(type)) {
    // if the value is a string that is 'false', '0', 'undefined', or 'null' as a string set a boolean false
    if (
      typeof value === 'string' && (
        value === 'false' ||
        value === '0' ||
        value === 'undefined' ||
        value === 'null'
      )
    ) {
      return false;
    }
    return Boolean(value);
  }

  return value;
}


/// @name getPaths
/// @description finds all the paths to be used
/// @arg {object} obj - The object to be searched
/// @returns {object}
/// ```js
/// {
///   model: [],
///   document: [],
/// }
/// ```
export function getPaths(obj) {
  // finds all of the properties paths in a model
  const model = objectSearch(obj, /^properties\.([^.]+|(?!items\.).+properties\.[^.]+)$/)
    .filter((str) => !str.includes('items.properties'));

  return {
    model,
    // finds all of the paths that will be used by a rendered document
    document: model.join(',').replace(/properties\./g, '').split(','),
  };
}

/// @name typeToValue
/// @description generates the initial value for a variable based on the data type
/// @arg {string} type
/// @returns {*} - What ever the value is that matches it.
/// @raw-code
export function typeToValue(type) {
  const types = {};
  types.string = '';
  types.object = types.structure = {};
  types.number = types.integer = types.double = types.long = types.float = 0;
  types.array = [];
  types.boolean = types.bool = false;

  return types[type] != null ? types[type] : null;
}
