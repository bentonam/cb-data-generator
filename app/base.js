import path from 'path';

import to from 'to-js';

import Logger from './logger';

/// @name Base
/// @page api
/// @description This holds the base functions that each of the classes in the application will extend
export default class Base extends Logger {
  /// @name constructor
  /// @arg {object} options - Global options for the different classes
  /// @raw-code
  constructor(options = {}) {
    super(options);
    const root = process.cwd();
    this.options = to.extend({
      root,
      log: true,
      verbose: false,
      spinners: true,
      timestamp: true,
    }, this.options || {});
    this.options = to.extend(this.options, options);

    this.options.root = path.resolve(root, this.options.root);

    if (this.options.verbose) {
      this.options.log = true;
    }

    if (!this.options.log) {
      this.options.spinners = false;
    }
  }

  /// @name resolvePaths
  /// @description This is used to parse paths that are passed to the different functions
  /// @arg {string, array} paths - The paths to normalize
  /// @arg {string} root [this.options.root] - This is the base that will resolve other paths
  /// @returns {array} An empty array or an array containing paths
  resolvePaths(paths, root = this.options.root) {
    if (!paths) {
      return [];
    }
    return to.string(paths, ', ')
      .split(/\s*(?:,| )\s*/)
      .filter(Boolean)
      .map((file) => {
        if (path.isAbsolute(file)) {
          return file;
        }
        return path.join(root, file);
      });
  }
}
