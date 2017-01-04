var utils = require('../../../../utils.js');
var is = require('joi');

module.exports = is.object({
  name: 'Orders',
  type: utils.types.object,
  file: is.string(),
  root: is.string(),
  is_dependency: is.boolean(),
  key: '_id',
  data: is.object({
    min: is.number().min(300).max(300),
    max: is.number().min(600).max(600),
    count: is.number().min(300).max(600),
    dependencies: is.array().items(is.string()).length(2),
    inputs: is.object().length(0),
  }),
  properties: is.object({
    _id: utils.check('string', 'The document id', { post_build: is.func(), }),
    doc_type: utils.check('string', 'The document type', { value: is.string(), }),
    order_id: utils.check('integer', 'The order_id', { build: is.func(), }),
    user_id: utils.check('integer', 'The user_id that placed the order', { build: is.func(), }),
    order_date: utils.check('integer', 'An epoch time of when the order was placed', { fake: is.string(), post_build: is.func(), }),
    order_status: utils.check('string', 'The status of the order', { build: is.func(), }),
    billing_name: utils.check('string', 'The name of the person the order is to be billed to', { build: is.func(), }),
    billing_phone: utils.check('string', 'The billing phone', { fake: is.string(), post_build: is.func(), }),
    billing_email: utils.check('string', 'The billing email', { fake: is.string(), }),
    billing_address_1: utils.check('string', 'The billing address 1', { build: is.func(), }),
    billing_address_2: utils.check('string', 'The billing address 2', { build: is.func(), }),
    billing_locality: utils.check('string', 'The billing city', { fake: is.string(), }),
    billing_region: utils.check('string', 'The billing region, city, province', { fake: is.string(), }),
    billing_postal_code: utils.check('string', 'The billing zip code / postal code', { fake: is.string(), }),
    billing_country: utils.check('string', 'The billing region, city, province', { value: is.string(), }),
    shipping_name: utils.check('string', 'The name of the person the order is to be billed to', { build: is.func(), }),
    shipping_address_1: utils.check('string', 'The shipping address 1', { build: is.func(), }),
    shipping_address_2: utils.check('string', 'The shipping address 2', { build: is.func(), }),
    shipping_locality: utils.check('string', 'The shipping city', { fake: is.string(), }),
    shipping_region: utils.check('string', 'The shipping region, city, province', { fake: is.string(), }),
    shipping_postal_code: utils.check('string', 'The shipping zip code / postal code', { fake: is.string(), }),
    shipping_country: utils.check('string', 'The shipping region, city, province', { value: is.string(), }),
    shipping_method: utils.check('string', 'The shipping method', { build: is.func(), }),
    shipping_total: utils.check('double', 'The shipping total', { build: is.func(), }),
    tax: utils.check('double', 'The tax total', { build: is.func(), }),
    line_items: utils.check('array', 'The products that were ordered', { build: is.func(), }),
    grand_total: utils.check('double', 'The grand total of the order', { post_build: is.func(), }),
  }),
});
