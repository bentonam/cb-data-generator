import { extend } from 'lodash';
import path from 'path';
import default_options from './default-options';
import Base from '../base';
import fs from 'fs-extra-promisify';

/// @name Folder
/// @page api
/// @description This is used to output data to the Folder
export default class Folder extends Base {
  ///# @name constructor
  ///# @arg {object} options - The base options
  ///# @arg {object} output_options - The output options
  constructor(options = {}, output_options = {}) {
    super(options);
    this.output_options = extend({}, default_options, output_options);

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

    // Resolve the output path to make sure it's absolute
    this.output_options.output = this.resolvePaths(this.output_options.output)[0];

    // Ensure there is a directory to write to. This way we can use `fs.writeFile`
    // instead of `fs.outputFile` which has extra checks that we can skip over
    await fs.ensureDir(this.output_options.output);

    this.prepared = true;
  }

  ///# @name output
  ///# @description
  ///# This is used to output the data that is passed to it
  ///# @arg {string} id - The id to use for this data
  ///# @arg {object, array, string} data - The data that you want to be saved
  ///# @async
  async output(id, data) {
    if (this.prepared !== true) {
      if (this.preparing == null) {
        this.prepare();
      }
      await this.preparing;
    }

    // Some files may contain an id or key property that contains backslashes so we must
    // be sure to create the directory structure and file before trying to write to the file
    // otherwise the writeFile function will fail with a `no such file or directory` error.
    const fileToWriteTo = path.join(this.output_options.output, `${id}.${this.output_options.format}`);
    await fs.ensureFile(fileToWriteTo);

    return fs.writeFile(fileToWriteTo, data);
  }
}
