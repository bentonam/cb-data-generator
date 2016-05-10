'use strict';

import path from 'path';
import input from './input';
import models from './models';
import output from './output';

const defaults = {
  output: 'console',
  archive: '',
  models: process.cwd(),
  destination: process.cwd(),
  format: 2,
  server: '127.0.0.1',
  bucket: 'default'
};

export default function start(options = {}) {
  options = Object.assign({}, defaults, options);
  return new Promise((resolve, reject) => {
    try {
      // console.log('generator.start');
      validate(options);
      input.prepare(options)
        .then(() => models.prepare(options))
        .then((model_documents_count) => output.prepare(options, resolve, reject, model_documents_count))
        .then(models.generate)
        .catch((err) => {
          console.log(err);
          output.error_cleanup()
            .then(() => {
              reject(err);
            })
            .catch(() => {
              reject(err);
            });
        });
    } catch (e) {
      reject(e);
    }
  });
};

const validate = (options) => {
  if ('json,csv,yml,yaml,couchbase,sync-gateway'.indexOf(options.output) === -1) { // validate output format
    throw new Error('Unsupported output type');
  } else if (options.archive && path.extname(options.archive) !== '.zip') { // validate archive format
    throw new Error('The archive must be a zip file');
  } else if (options.destination === 'couchbase' && (!options.server || !options.bucket)) { // validate couchbase
    throw new Error('For the server and bucket must be specified when outputting to Couchbase');
  } else if (options.destination === 'couchbase' && options.archive) { // validate couchbase
    throw new Error('The archive option cannot be used when the output is couchbase');
  }
};
