// @flow

import { cpus } from 'os'
import findRoot from 'find-root'
import path from 'path'
import fs from 'fs-extra-promisify'
import globby from 'globby'
import { mergeWith } from 'lodash'
import buildDebug from 'debug'
import joi from 'joi'
import { validate } from './utils'
import Config from './config'
import requirePkg from './require-pkg'
import FakeitError from './error'

function merge (...args: Object[]): Object {
  return mergeWith(...args, (objValue: mixed, srcValue: mixed): mixed[] | void => {
    if (Array.isArray(objValue)) {
      return objValue.concat(srcValue)
    }
  })
}

const debug = buildDebug('@fakeit/core:api')
const max_threads = cpus().length - 1
const options_schema = joi
  .object({
    root: joi.string()
      .trim(),
    format: joi
      .string()
      .trim()
      .regex(/^[a-z]{2,6}$/),
    spacing: joi.alternatives()
      .try(
        joi
          .number()
          .min(0)
          .max(4),
        joi
          .string()
          .min(0)
          .max(4),
      ),
    count: joi.alternatives()
      .try(null, joi.number()
        .min(1)),
    output: joi.alternatives()
      .try(joi.func(), joi.string()),
    threads: joi
      .number()
      .min(1)
      .max(max_threads),
    limit: joi
      .number()
      .min(1)
      .max(1000),
    plugins: joi
      .alternatives()
      .try(
        null,
        joi.string(),
        joi.func(),
        joi.array()
          .items(joi.alternatives()
            .try(null, joi.string(), joi.func())),
      ),
    timeout: joi.number()
      .min(1000),
    seed: joi.alternatives()
      .try(null, joi.number(), joi.string()),
  })
  .unknown()

export default class Api {
  settings: Object = {}
  config: Config

  // note that the only real way to pass in arguments here is to pass
  // them in during testing
  constructor (options: Object) {
    this.settings = Object.assign(
      {
        root: process.cwd(),

        // this is the format to output it in.
        // The default is json because it's installed automatically
        format: 'json',

        // Sets a global count that's used instead of the count defined on the model.
        // If this is set then it will also override anything that's dynamically set via
        // `fakeit.before(() => ...)` on a model level
        count: null,

        // the character(s) to use for spacing. default is 2 because it's the most common
        spacing: 2,

        // The type of output to use.
        // This can be a function or string that matches one of the registered output types
        output (): void {},

        // the number of threads to use. The default number of threads is the max amount that
        // your computer has to offer
        threads: max_threads,

        // limit how many files are output at a time, this is useful
        // to not overload a server or lock up your computer
        limit: 50,

        // note this is autofilled, but a user can pass it into the config just incase
        plugins: [],

        // the max time allowed to output files
        timeout: 5000,

        // The global seed to use for repeatable data
        seed: null,
      },
      /* istanbul ignore next : to hard to test, also no reason to test for it */
      options || {},
    )

    this.config = new Config(this.settings)

    // this loads all the config files/plugins
    this._loadConfigs()
  }

  /// @name options
  /// @description This function allows you to pass in additional options into the api
  /// after it has been instantiated. For example this is used with the @fakeit/cli
  /// @arg {object} options - The options you're wanting to add to the config
  /// @markup Example:
  /// const api = new Api()
  /// api.options({
  ///   format: 'csv',
  /// })
  /// @chainable
  /// @note The only thing you can't add as an option after is a plugin.
  /// That must be passed into the constructor or config files
  options (options: Object = {}): Api {
    options = validate(options, options_schema)

    if (options.plugins) {
      throw new FakeitError("plugins can't be passed into api.options(), they must be defined in a `fakeitfile.js` or `package.json`")
    }

    merge(this.settings, options)
    this.config.runOptions()
    return this
  }

  /// @name _loadConfigs
  /// @description This will load any configurations declared in `fakeitfile.js`, `package.json`
  /// It will also auto import plugins
  /// @access private
  /// @chainable
  _loadConfigs (): Api {
    // sync is used here so that the api isn't
    // weird `new Api().setup().then(() => )` would be weird af
    /* eslint-disable no-sync */
    debug('setup start')
    const root = findRoot(this.settings.root)
    const {
      fakeit: user_pkg_config,
      dependencies = {},
      peerDependencies = {},
      devDependencies = {},
    } = fs.readJsonSync(path.join(root, 'package.json'))
    let fakeitfile_config: Object = {}
    const fakeitfile = './fakeitfile.js'
    try {
      fakeitfile_config = requirePkg(fakeitfile, root)
    } catch (e) {
      debug(`no config file was found: ${fakeitfile}`)
      // do nothing because we don't care if the file exists or not
    }
    debug('fakeitfile.js config: %O', fakeitfile_config)
    debug('package.json config: %O', user_pkg_config)

    let options = merge({}, user_pkg_config || {}, fakeitfile_config)

    options = validate(options, options_schema)

    // dynamically get the plugins based of the users `package.json`
    // and by looking in the `node_modules` folder
    const dynamic_plugins = []
      .concat(
        Object.keys(Object.assign(dependencies, peerDependencies, devDependencies)),
        globby.sync(path.join('@fakeit/*'), { cwd: path.join(root, 'node_modules'), nodir: false }),
      )
      // filter out any packages that don't match @fakeit/format* or @fakeit/plugin*
      .filter((pkg: string) => pkg && /@fakeit\/(format|plugin).*/.test(pkg))
    debug('dynamic_plugins: %O', dynamic_plugins)
    options.plugins = dynamic_plugins
      .concat(this.settings.plugins, options.plugins)
      // filter out any duplicate strings. This can't use `_.uniq` otherwise it would filter out
      // annonymous functions that could be defined in the `fakeitfile.js`
      .filter((item: string | Function, i, array) => {
        // functions can be defined in fakeitfile.js
        if (typeof item === 'function') {
          return true
        }
        // ensure there's not another item in the array with the same value
        // that comes after the current index
        return item && !array.includes(item, i + 1)
      })

    // loop over all the plugins to load them and run them
    for (const plugin of options.plugins) {
      if (typeof plugin === 'function') {
        // anything that runs in here was defined in the users `fakeitfile.js`
        try {
          plugin(this.config)
          debug('ran fakeitfile.js plugin init')
        } catch (e) {
          e.message = `error with plugin defined in fakeitfile.js. ${e.message}`
          throw new FakeitError(e)
        }
      } else {
        // anything that runs in here was imported either dynamically or by specifying a string
        let pluginFn: Function

        try {
          pluginFn = requirePkg(plugin, root)
          debug(`loaded plugin: ${plugin}`)
        } catch (e) {
          debug(`couldn't load ${plugin}`)
        }

        // if it was loaded
        if (pluginFn) {
          try {
            pluginFn(this.config)
            debug(`ran plugin init: ${plugin}`)
          } catch (e) {
            e.message = `error running plugin ${plugin}. ${e.message}`
            throw new FakeitError(e)
          }
        }
      }
    }

    debug('plugins %O', options.plugins)
    delete options.plugins

    this.options(options)

    debug('setup end')
    return this
  }

  ///# @name runCli
  ///# @description
  ///# This is used to run the cli plugin commands that will add different commands to the cli
  ///# @arg {caporal} caporal - The Caporal.js instance
  ///# @async
  runCli (caporal: Object): Promise<void> {
    return this.config.runCli(caporal)
  }

  ///# @name runPlugins
  ///# @description
  ///# This function is used to run the plugins for the models
  runPlugins (): Api {
    this.config.runPlugins()
    return this
  }
}
