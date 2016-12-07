import { extend } from 'lodash';
import default_options from './default-options';
import Base from '../base';
import to from 'to-js';
import req from 'request';
import cookieParser from 'set-cookie-parser';

/// @name SyncGateway
/// @page api
/// @description This is used to output data to the SyncGateway
export default class SyncGateway extends Base {
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

    const { username: name, password, server, bucket } = this.output_options;

    // do nothing?
    // should this throw an error?
    if (!name && !password) {
      return;
    }

    let [ res, body ] = await request({
      url: `${server}/${encodeURIComponent(bucket)}/_session`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: to.json({ name, password }),
    });

    body = to.object(body);

    if (
      body.ok &&
      res.headers['set-cookie']
    ) {
      const cookie = cookieParser.parse(res);
      this.session = {
        name: cookie[0].name,
        id: cookie[0].value,
      };
    } else if (body.error) {
      return this.log('error', body.error);
    } else {
      return this.log('error', 'Unable to connect to Sync Gateway');
    }

    this.prepared = true;
  }

  ///# @name output
  ///# @description
  ///# This is used to output the data that's passed to it
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

    const { server, bucket } = this.output_options;

    const options = {
      url: `${server}/${bucket}/${encodeURIComponent(id)}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // @todo remove this comment
      // not using this because the main Output function handles the data conversion
      // body: JSON.stringify(data),
      body: data,
    };

    // if there is a an authenticated sync session use it
    if (this.session) {
      const jar = req.jar();
      const cookie = req.cookie(`${this.session.name}=${this.session.id}`);
      jar.setCookie(cookie, server);
      options.jar = jar;
    }

    const body = to.object((await request(options))[1]);

    if (body.error) {
      if (body.reason === 'Document exists') {
        body.reason = `The '${id}' document already exists`;
      }
      this.log('error', body.reason);
    }
  }
}


/// @name request
/// @description
/// This converts the call back style of `request` to be a promise style
/// @arg {object} options - The options to pass onto the `request` function
/// @returns {array} - The first item in the array is the `res`, and the second item is the `body` response.
/// @async
export function request(options = {}) {
  return new Promise((resolve, reject) => {
    req(options, (err, res, body) => {
      if (err) return reject(err);

      resolve([ res, body ]);
    });
  });
}
