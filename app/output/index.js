////
/// @page api
////

import path from 'path';
import { extend, mean, uniqueId } from 'lodash';
import to, { is } from 'to-js';
import Base from '../base';
import { parsers, pool } from '../utils';
import default_options from './default-options';
import perfy from 'perfy';

export const output_types = [ 'return', 'console', 'couchbase', 'sync-gateway' ];

/// @name Output
/// @description
/// This is used to output data into different environments
export default class Output extends Base {
  ///# @name constructor
  ///# @arg {object} options [{}] - The options that apply to Base
  ///# @arg {object} output_options - The options for how you want save data
  ///# {
  ///#
  ///# }
  ///# @todo update the output_options to have the final options and descriptions of each
  constructor(options = {}, output_options = {}) {
    super(options);

    this.output_options = extend({}, default_options, output_options);

    this.validateOutputOptions();

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
  async setup() {
    // if this.prepare hasn't been called then run it first.
    if (this.preparing == null) {
      return this.prepare();
    }
    let { output, archive } = this.output_options;

    if (!output_types.includes(output)) {
      output = !!archive ? 'zip' : 'folder';
    }

    // get the outputter to use
    if (output !== 'return') {
      const Outputter = require(`./${output}`).default;
      // creates a new instance of it so that we can use it to output the data in
      // what ever way that the user wants to output it in.
      this.outputter = new Outputter(this.options, this.output_options);
      // if the outputter has a prepare function call it and await for it to be done
      if (typeof this.outputter.prepare === 'function') {
        await this.outputter.prepare();
      }
      this.prepared = true;
      return;
    }

    process.nextTick(() => {
      this.prepared = true;
    });
  }

  ///# @name output
  ///# @description
  ///# This is used to save data to any place that was passed in the constructor
  ///# @arg {array, object} documents - The data that you want to be saved
  ///# @arg {object} options - Options needed by the output such as scope or collection
  ///# @returns {array, object, string} - This is determined by the output type that's passed and the format that's used.
  ///# @async
  // eslint-disable-next-line max-statements
  async output(documents, outputOptions = {}) {
    let count = 0;
    if (!documents) {
      return this.log('error', 'You must pass in documents to the output');
    }

    documents = to.array(documents);

    if (this.prepared !== true) {
      if (this.preparing == null) {
        this.prepare();
      }
      await this.preparing;
    }

    const { format, spacing, limit, output } = this.output_options;
    const name = documents[0].__name; // eslint-disable-line
    const spinner = this.spinner(`Outputting ${name}`);
    const times = [];
    const update = () => {
      spinner.text = `Outputting ${name} to ${output} (${count}/${documents.length})`;
      if (times.length) {
        spinner.text += ` (${mean(times).toFixed(2)}ms on average)`;
      }
    };

    const parser = this.getParser(output, format);

    // if the output type is `return` or `console` then this will return the complete
    // data set instead of running them individually
    if ([ 'return', 'console' ].includes(output)) {
      const parsed = await parser(documents, spacing);
      // hack to get around the console outputting before the spinner
      if (output === 'console') {
        spinner.start();
        const result = await this.outputter.output(null, parsed, outputOptions);
        spinner.text = `Outputting ${name} to ${output}`;
        spinner.stop();
        console.log(result);
        return result;
      }
      return parsed;
    }

    // if the output isn't `return` or `console` and the `format` is `csv`
    // then it needs to be updated
    if (format === 'csv') {
      documents = [ documents ];
    }

    // reformat the data into the output type
    spinner.start();
    return pool(documents, async (document, i) => {
      const label = uniqueId(`document ${name} ${i}`);
      perfy.start(label);
      const key = document.__key || document.__name || (document[0] || {}).__name || ''; // eslint-disable-line no-underscore-dangle
      // use the outputter's output function to output the data
      const result = await this.outputter.output(key, await parser(document, spacing), outputOptions);
      update(count++);
      times.push(perfy.end(label).milliseconds);
      return result;
    }, limit)
      .then((result) => {
        spinner.stop();
        return result;
      })
      .catch((err) => {
        spinner.fail(err);
      });
  }

  ///# @name finalize
  ///# @description
  ///# This is used to clean up anything that needs to be cleaned up
  ///# like a connection to a data base, any event listeners, or finish outputting a zip file.
  ///# @async
  async finalize() {
    if (
      this.outputter &&
      is.function(this.outputter.finalize)
    ) {
      await this.outputter.finalize();
    }
  }

  ///# @name validateOutputOptions
  ///# @description This is used to validate the output options
  ///# @throws {error} - If an option that was passed is invalid.
  validateOutputOptions() {
    to.each(this.output_options, ({ key, value }) => {
      try {
        validate[key](value, this.output_options);
      } catch (e) {
        this.log('error', e);
      }
    });
  }

  ///# @name getParser
  ///# @description Returns a parser function for the given output type and format
  ///# @arg {string} output - Output type
  ///# @arg {string} format - Output format
  ///# @returns {function} - Function to format a document
  getParser(output, format) {
    if (
      output === 'couchbase' &&
      format === 'json'
    ) {
      return (obj) => obj;
    }
    return parsers[format].stringify;
  }
}


/// @name Output validate
/// @description This holds the different options that can be passed to the Output constructor
/// @type {object}
export const validate = {
  ///# @name format
  ///# @description Used to validate the format option
  ///# @arg {string} option - The option to validate against
  ///# @throws {error} - If the format option that was pass was invalid
  format(option) {
    const formats = [ 'json', 'csv', 'yaml', 'yml', 'cson' ];
    if (
      isString(option, 'format') &&
      formats.includes(option)
    ) {
      return;
    }
    throw new Error(`You must use one of the following formats ${formats}. You passed ${option}`);
  },

  ///# @name spacing
  ///# @description Used to validate the spacing option
  ///# @arg {number} option - The option to validate against
  ///# @throws {error} - If the spacing option that was pass was invalid
  spacing(option) {
    if (option === '0' || option === 'null') {
      option = 0;
    }
    if (!is.number(option)) {
      throw new Error('The spacing option must be a number');
    }
  },

  ///# @name output
  ///# @description Used to validate the output option
  ///# @arg {string} option - The option to validate against
  ///# @throws {error} - If the output option that was pass was invalid
  output(option) {
    if (!isString(option, 'output')) return;

    if (
      output_types.includes(option) ||
      !path.extname(option)
    ) {
      return;
    }

    throw new Error(`The output option must be ${output_types.join(', ')}, or a folder path`);
  },

  ///# @name highlight
  ///# @description Used to validate the highlight option
  ///# @arg {boolean} option - The option to validate against
  ///# @throws {error} - If the highlight option that was pass was invalid
  highlight(option) {
    if (!is.boolean(option)) {
      throw new Error('The highlight option must be a boolean');
    }
  },

  ///# @name limit
  ///# @description Used to validate the limit option
  ///# @arg {number} option - The option to validate against
  ///# @throws {error} - If the limit option that was pass was invalid
  limit(option) {
    if (!is.number(option)) {
      throw new Error('The limit option must be a number');
    }
  },

  ///# @name archive
  ///# @description Used to validate the archive option
  ///# @arg {boolean} option - The option to validate against
  ///# @throws {error} - If the archive option that was pass was invalid
  archive(option, { output }) {
    if (!is.string(option)) {
      throw new Error('The archive option must be a string');
    }

    // there's no archive file specified
    if (!option.length) return;

    if (
      option &&
      [ 'return', 'console' ].includes(output)
    ) {
      throw new Error(`You can\'t have an archive file when you have the output option set to ${output}`);
    } else if (path.extname(option) !== '.zip') {
      throw new Error('The archive file must have a file extention of `.zip`');
    }
  },

  ///# @name server
  ///# @description Used to validate the server option
  ///# @arg {string} option - The option to validate against
  ///# @arg {object} options - The other options for that are being validated
  ///# @throws {error} - If the server option that was pass was invalid
  server(option, { output, archive }) {
    // ignore this validation if the output isn't one of these
    if (!isServer(output)) return;

    if (archive === true) {
      throw new Error(`The archive option can't be used with ${option}`);
    }

    isString(option, 'server');
  },

  ///# @name bucket
  ///# @description Used to validate the bucket option
  ///# @arg {string} option - The option to validate against
  ///# @arg {object} options - The other options for that are being validated
  ///# @throws {error} - If the bucket option that was pass was invalid
  bucket(option, { output }) {
    // ignore this validation if the output isn't one of these
    if (!isServer(output)) return;

    isString(option, 'bucket');
  },

  ///# @name username
  ///# @description Used to validate the username option
  ///# @arg {string} option - The option to validate against
  ///# @arg {object} options - The other options for that are being validated
  ///# @throws {error} - If the username option that was pass was invalid
  username(option) {
    if (!is.string(option)) {
      throw new Error('The username option must be a string');
    }
  },

  ///# @name password
  ///# @description Used to validate the password option
  ///# @arg {string} option - The option to validate against
  ///# @arg {object} options - The other options for that are being validated
  ///# @throws {error} - If the password option that was pass was invalid
  password(option) {
    if (!is.string(option)) {
      throw new Error('The password option must be a string');
    }
  },

  ///# @name limit
  ///# @description Used to validate the limit option
  ///# @arg {number} option - The option to validate against
  ///# @throws {error} - If the limit option that was pass was invalid
  timeout(option) {
    if (!is.number(option)) {
      throw new Error('The timeout option must be a number');
    }
  },

  ///# @name useStreams
  ///# @description Used to validate the useStreams option
  ///# @arg {boolean} option - The option to validate against
  ///# @throws {error} - If the useStreams option that was pass was invalid
  useStreams(option) {
    if (!is.boolean(option)) {
      throw new Error('The useStreams option must be a boolean');
    }
  },

  ///# @name highWaterMark
  ///# @description Used to validate the highWaterMark option
  ///# @arg {number} option - The option to validate against
  ///# @throws {error} - If the highWaterMark option that was pass was invalid
  highWaterMark(option) {
    if (!is.number(option)) {
      throw new Error('The highWaterMark option must be a number');
    }
  }
};


/// @name isServer
/// @description This is used to check if the output is `sync-gateway` or `couchbase`
/// @arg {string} output - The output that's being used
/// @returns {boolean} - If true the output option is a server
export function isServer(output) {
  return [ 'sync-gateway', 'couchbase' ].includes(output);
}

/// @name isString
/// @description This is used to check if an option is a string and that it has a length
/// @arg {*} option - The option that's passed
/// @arg {string} name - The name of the validate function that this is called in
/// @returns {boolean} - If true the option that was passed is a string and has a length.
/// @throws {error} - If the option isn't a string
/// @throws {error} - If the option is a string and doesn't have a length
export function isString(option, name = '') {
  if (!!name) {
    name = ` ${name} `;
  }
  if (!is.string(option)) {
    throw new Error(`The${name}option must be a string`);
  } else if (
    is.string(option) &&
    !option.length
  ) {
    throw new Error(`The${name}option must have a length`);
  }
  return true;
}
