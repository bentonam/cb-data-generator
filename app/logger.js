import to from 'to-js';
import chalk from 'chalk';
import symbols from 'log-symbols';
import perfy from 'perfy';
import ora from 'ora';
import formatSeconds from 'format-seconds';
import Emitter from 'events-async';

symbols.warn = symbols.warning;
symbols.ok = symbols.okay = symbols.success;

/// @name Logger
/// @description
/// This is the main logger for the application
export default class Logger extends Emitter {
  ///# @name constructor
  ///# @arg {object} options [{ log: true, verbose: false, timestamp: true }]
  constructor(options = {}) {
    super();
    this.setMaxListeners(50);
    this.options = to.extend({
      log: true,
      verbose: false,
      timestamp: true,
      spinners: true,
    }, options);

    // ensure that if `verbose` is true then `log` must also be true
    if (this.options.verbose) {
      this.options.log = true;
    }

    if (!this.options.log) {
      this.options.spinners = false;
    }

    ///# @name log_types
    ///# @static
    ///# @type {object}
    ///# @raw-code
    this.log_types = {
      error: 'red',
      warning: 'yellow',
      success: 'green', // possibly remove
      info: 'blue',
      verbose: 'magenta',
      log: 'gray'
    };

    this.spinners = {};
  }

  ///# @name log
  ///# @description This is used to control the logging of an app
  ///# @arg {*} type
  ///# If this is a `string` and matches `error`, `warning`, `success`, `info`, `verbose`, `log` then it
  ///# will add special characters before the rest of the log depending on the type that was passed.
  ///# If it's not one of these then the type will default to `log` and the value you passed will be
  ///# prepended to the rest of the arguments
  ///# @arg {*} arg - What will be logged;
  ///# @chainable
  log(type, arg) {
    if (type instanceof Error) {
      arg = type;
      type = 'error';
    }
    if (this.options.log || type === 'error') {
      if ([ 'time', 'timeEnd' ].includes(type)) {
        return this[type](arg);
      }

      if (!to.keys(this.log_types).includes(type)) {
        arg = type;
        type = 'log';
      }

      if (type === 'verbose') {
        if (!this.options.verbose) return;
        type = 'console';
      }

      const stamp = this.stamp(type);

      // print the current time.
      if (stamp) {
        process.stdout.write(stamp);
      }

      console.log(arg);

      if (type === 'error') {
        if (arg instanceof Error) {
          throw arg;
        } else {
          throw new Error(arg);
        }
      }
    }
    return this;
  }

  ///# @name stamp
  ///# @description This will generate a colorized timestamp and message depending on the time that's passed.
  ///# @arg {string} type ['log'] - This determins the type of stamp to return. This can be any of the types that you can pass to `this.log`
  ///# @returns {string} The stamp that was generated.
  stamp(type = 'log') {
    const now = new Date();
    const timestamp = [ now.getHours(), now.getMinutes(), now.getSeconds() ].join(':');
    const color = this.log_types[type];
    let stamp = this.options.timestamp ? `[${chalk.magenta(timestamp)}] ` : '';
    if (symbols[type]) {
      stamp += `${symbols[type]} `;
    }
    if ([ 'error', 'warning', 'info' ].includes(type)) {
      stamp += `${chalk[color](type)}: `;
    }

    return stamp;
  }

  ///# @name time
  ///# @description
  ///# This does the same thing as `console.time`.
  ///# @arg {string} label - This is the label for your timed event
  ///# @chainable
  time(label) {
    if (!label) {
      return this.log('error', 'You must pass in a label for `Logger.prototype.time`');
    }
    perfy.start(label);
    return this;
  }

  ///# @name timeEnd
  ///# @description
  ///# This does the same thing as `console.timeEnd`.
  ///# @arg {string} label - This must be the same label that was passed to the associated `this.time` function
  ///# @returns {string} - The total time it took to run the process
  timeEnd(label) {
    if (!label) {
      return this.log('error', 'You must pass in a label for `Logger.prototype.timeEnd`');
    }
    const time = `+${formatSeconds(perfy.end(label).time)}`;
    return `${chalk.cyan(time)}`;
  }

  ///# @name spinner
  ///# @description
  ///# This creates an instance of a spinner to help show progress of something. It returns and instance of [ora](https://github.com/sindresorhus/ora)
  ///# @arg {string} options - Same options passed to [ora](https://github.com/sindresorhus/ora). You can additionaly pass in `verbose` as an option that is a boolean
  ///# @returns {object} - The new instance of [ora](https://github.com/sindresorhus/ora)
  spinner(options) {
    if (typeof options === 'string') {
      options = { text: options };
    }

    if (this.spinners[options.text]) {
      return this.spinners[options.text];
    }

    options.isEnabled = this.options.spinners || options.spinners || true;
    options.stream = process.stdout;

    const spinner = this.spinners[options.text] = ora(options);
    spinner.title = options.text;
    const self = this;
    // store the originals
    spinner.originalStart = spinner.start;
    spinner.originalStop = spinner.stop;
    // overwrite it to support timing
    spinner.start = function start() {
      if (
        !this.isEnabled ||
        !self.options.spinners
      ) {
        return this;
      }
      this.originalStart();
      if (self.options.verbose) {
        self.time(`spinner_${this.title}`);
      }
      return this;
    };
    spinner.stop = function stop() {
      if (
        !this.isEnabled ||
        this.id == null ||
        !self.options.spinners
      ) {
        return this;
      }

      if (self.options.verbose) {
        const time = self.timeEnd(`spinner_${this.title}`);
        spinner.text += ` ${time}`;
        this.succeed();
        return this;
      }
      return this.originalStop();
    };

    spinner.fail = function fail(err) {
      spinner.stopAndPersist({
        symbol: symbols.error
      });
      // stop the rest of spinners
      to.each(self.spinners, ({ value }) => {
        value.originalStop();
      });

      self.log('error', err);
    };

    spinner.stopAndPersist = function stopAndPersist(symbol) {
      if (
        !this.isEnabled ||
        this.id == null ||
        !self.options.spinners
      ) {
        return this;
      }
      this.originalStop();

      this.stream.write(`${symbol.symbol || ' '} ${this.text}\n`);
      return this;
    };
    return spinner;
  }
}
