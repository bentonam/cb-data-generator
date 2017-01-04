var utils = require('../../../../utils.js');
var is = require('joi');

module.exports = is.object({
  name: 'Posts',
  type: utils.types.object,
  file: is.string(),
  root: is.string(),
  is_dependency: is.boolean(),
  key: '_id',
  data: is.object({
    min: is.number().min(0).max(0),
    max: is.number().min(1).max(1),
    count: is.number().min(1).max(1),
    dependencies: is.array().items(is.string()).length(1),
    inputs: is.object().length(0),
    pre_run: is.func(),
  }),
  properties: is.object({
    _id: utils.check('string', 'The document id', { post_build: is.func(), }),
    doc_type: utils.check('string', 'The document type', { value: is.string(), }),
    post_id: utils.check('string', 'The post id as a GUID', { build: is.func(), }),
    user_id: utils.check('integer', 'The user_id that made the post', { build: is.func(), }),
    post_date: utils.check('integer', 'The date of the post', { build: is.func(), }),
    post: utils.check('string', 'The post content', { build: is.func(), }),
    visibility: utils.check('string', 'The post visibility', { build: is.func(), }),
    post_access: utils.check('array', 'An array of users who can see the post if the visibility is private', { post_build: is.func(), }),
  }),
});
