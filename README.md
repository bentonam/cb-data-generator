# FakeIt Data Generator

Command-line utility that generates output data in JSON, YAML, CSON, or CSV formats based on models which are defined in YAML.  Data can be generated using any combination of [FakerJS](http://marak.github.io/faker.js/), [ChanceJS](http://chancejs.com/), or Custom Build Functions.  Model dependencies can be defined, where data from a previous model's generation can be made available to the model currently being generated.

Generated data can be output in the following formats and destinations:

- JSON files
- YAML files
- CSON files
- CSV files
- Zip Archive of JSON, YAML, CSON or CSV files
- Couchbase Server
- Couchbase Sync Gateway Server

## Install

```bash
npm install fakeit -g
```

## Usage

```bash
fakeit [options]
```

## Options

- `-o, --output [value]` *(optional)* The output format to generate.  Supported formats are: json, csv, yaml, cson. The default value is **json**
- `-a, --archive [value]` *(optional)* The archive filename to generate.  Supported formats are: zip.  Example: export.zip
- `-m, --models [value]` *(optional)* A directory or comma-delimited list of files models to use.  The default is the current working directory
- `-d, --destination [value]` *(optional)* The output destination.  Values can be: couchbase, console or a directory path.  The default value is the current working directory.  If the directory path does not exist, it will be created automatically.
- `-f, --format [value]` *(optional)* The spacing format to use for JSON and YAML file generation.  The default value is 2
- `-n, --number [value]` *(optional)* Overrides the number of documents to generate specified by the model
- `-i, --input [value]` *(optional)* A directory of files or a comma-delimited list of files to use as inputs.  Support file types are: json, yaml, csv, cson, or a zip of the previous formats
- `-s, --server [address]` *(optional)* A Couchbase Server or Sync-Gateway Address.  The default value is **127.0.0.1**
- `-b, --bucket [name]` *(optional)* The name of a Couchbase Bucket.  The default value is **default**
- `-p, --password [value]` *(optional)* A Couchbase Bucket or Sync Gateway user password
- `-t, --timeout [value]` *(optional)* A timeout for database operations, the default is 5000
- `-l, --limit [value]` *(optional)* Limit the number of save operations at a time.  Default: 100
- `-u, --username [value]` *(optional)* A Sync Gateway username.
- `-e, --exclude [model]` *(optional)* A comma-delimited list of model names to exclude from output
- `-v` --verbose` *(optional)* Whether or not to use verbose output
- `-h, --help` Displays available options
- `-V, --version` Display the current version

## Models

All data is generated from one or more [YAML](http://yaml.org/) files.  Models are defined similarly to how models are defined in [Swagger](http://swagger.io/), with the addition of a few more properties that are used for data generation:

At the root of a model the following keys are used:

- `name:` *(required)* The name of the model
- `type:` *(required)* The data type of the model to be generated
- `key:` *(required)* The main key for the document.  This is a reference to a generated property and is used for the filename or Document ID
- `data:` *(optional)* Defines how many documents should be generated for the model, as well as event callbacks. The following properties are used:
  - `min:` *(optional)* The minimum number of documents to generate
  - `max:` *(optional)* The maximum number of documents to generate
  - `count:` *(optional)* A fixed number of documents to generate
  - `pre_run:` *(optional)* A function to be run *before the model* generation starts
  - `pre_build:` *(optional)* A function to be run *before each document* is generated
  - `post_build:` *(optional)* A function to be run *after each document* is generated
  - `post_run:` *(optional)* A function to be run *after all documents for a model* have been generated
- `properties:` *(required)* The properties for a model.  Each property can have the following:
  - `type:` *(optional)* The data type of the property.  Values can be: `string`, `number`, `integer`, `long`, `double`, `float`, `array`, `object`, `bool`, `boolean`
  - `description:` *(optional)* A description of the property
  - `data:` *(optional)* Defines the how the data should be generated.  The following properties can be used:
    - `value:` A static value to be used
    - `fake:` A template string to be used by Faker i.e. `"{{name.firstName}}"`
    - `pre_build:` A function to be called after the value has been initialized.  The property value is assigned from the result.
    - `build:` A function to be called to build the value. The property value is assigned from the result.
    - `post_build:` A function to be called on the property after all of the documents properties have been generated. The property value is assigned from the result.

#### Model Events / Build Functions

Each model can have it's own `pre_(run|build)` and `post_(run|build)` functions. Additionally, each property can have its on `pre_build`, `build` and `post_build` functions.

Each one of these functions is passed the following variables that can be used at the time of it's execution:

For the `run` functions, `this` refers to the current model. For the `build` functions, `this` refers to the document currently being generated.

- `documents` - An object containing a key for each model whose value is an array of each document that has been generated
- `globals` - An object containing any global variables that may have been set by any of the run or build functions
- `inputs` - An object containing a key for each input file used whose value is the deserialized version of the files data
- `faker` - A reference to [FakerJS](http://marak.github.io/faker.js/)
- `chance` - A reference to [ChanceJS](http://chancejs.com/)
- `document_index` This is a number that represents the currently generated document's position in the run order

#### Example `users.yaml` Model

```yaml
name: Users
type: object
key: _id
data:
  min: 200
  max: 500
  pre_run: >
    globals.user_counter = 0;
properties:
  id:
    type: string
    data:
      post_build: "return 'user_' + this.user_id;"
  type:
    type: string
    data:
      value: "user"
  user_id:
    type: integer
    data:
      build: "return ++globals.user_counter;"
  first_name:
    type: string
    data:
      fake: "{{name.firstName}}"
  last_name:
    type: string
    description: The users last name
    data:
      fake: "{{name.lastName}}"
  email_address:
    type: string
    data:
      fake: "{{internet.email}}"
  phone:
    type: string
    data:
      build: "return chance.phone();"
  created_on:
    type: string
    data:
      fake: "{{date.past}}"
      post_build: "return new Date(this.created_on).toISOString();"
```

We can generate data for this model by executing the following command:

```bash
fakeit -m users.yaml -n 5 -d console
```

This will generate 5 documents for the users model and output the results to the console:

```json
{
  "id": "user_1",
  "type": "user",
  "user_id": 1,
  "first_name": "Emile",
  "last_name": "Murphy",
  "email_address": "Jacques_Langosh0@yahoo.com",
  "phone": "(206) 627-7366",
  "active": true,
  "created_on": "2015-11-20T09:53:33.000Z"
}
{
  "id": "user_2",
  "type": "user",
  "user_id": 2,
  "first_name": "Levi",
  "last_name": "Osinski",
  "email_address": "Franz.Kshlerin@yahoo.com",
  "phone": "(925) 202-9963",
  "active": true,
  "created_on": "2016-04-01T13:54:09.000Z"
}
{
  "id": "user_3",
  "type": "user",
  "user_id": 3,
  "first_name": "Halle",
  "last_name": "Kutch",
  "email_address": "Deontae_Connelly4@gmail.com",
  "phone": "(972) 454-7846",
  "active": true,
  "created_on": "2016-02-28T06:45:42.000Z"
}
{
  "id": "user_4",
  "type": "user",
  "user_id": 4,
  "first_name": "Charlotte",
  "last_name": "Koch",
  "email_address": "Nora.Bauch68@hotmail.com",
  "phone": "(889) 304-9408",
  "active": false,
  "created_on": "2015-07-19T13:49:51.000Z"
}
{
  "id": "user_5",
  "type": "user",
  "user_id": 5,
  "first_name": "Sharon",
  "last_name": "Kutch",
  "email_address": "Jackie.Cremin@gmail.com",
  "phone": "(617) 245-7547",
  "active": true,
  "created_on": "2015-07-20T17:00:51.000Z"
}
```

### Model Dependencies

Often times generated data depends on other generated data, however for this to happen models need to be executed in a certain order.  Let's say we need to generate ecommerce related data and we have the following models:

- orders.yaml (needs data from both products and users)
- products.yaml
- users.yaml

If we were to execute the following to generate the data for these 3 models:

```bash
fakeit -d output/
```

This would fail because by default all models in a directory are used, and will be executed in the order that they are found, which in this case would be:

- orders.yaml
- products.yaml
- users.yaml

The **orders** model needs to reference generated documents from both **products** and **users**.  We could use the `-m` option to ensure that models are executed in order:

```bash
fakeit -d output/ -m users.yaml,products.yaml,orders.yaml
```

While this works, it would require us to remember this order and specify it anytime we would want to regenerate the models.  A better approach would be to define the dependencies as part of the model definitions, as seen in the [ecommerce example](https://github.com/bentonam/fakeit-examples/tree/master/ecommerce):

**[orders.yaml](https://github.com/bentonam/fakeit-examples/tree/master/ecommerce/models/orders.yaml)**

```yaml
name: Orders
type: object
key: _id
data:
  dependencies:
    - Products
    - Users
...
```

**[products.yaml](https://github.com/bentonam/fakeit-examples/tree/master/ecommerce/models/products.yaml)**

```yaml
name: Products
type: object
key: _id
...
```

**[users.yaml](https://github.com/bentonam/fakeit-examples/tree/master/ecommerce/models/users.yaml)**

```yaml
name: Users
type: object
key: _id
...
```

Now if we execute our original command:

```bash
fakeit -d output/
```

All of the model dependencies will be resolved and executed in the order that satisfies each model's dependencies. In this case the model order will be:

- products.yaml
- users.yaml
- orders.yaml

When the **orders.yaml** model is executed, the previously generated documents would be made available to the model's `run` and `build` functions through the `documents` variable.

```js
documents.Users = [...]; // the name of the users.yaml model
documents.Products = [...]; // the name of the products.yaml model
```

### Model References

It can be beneficial to define definitions that can be referenced one or more times throughout a model.  This can be accomplished by using the `$ref:` property.  Consider the following example:

**[contacts.yaml](https://github.com/bentonam/fakeit-examples/tree/master/contacts/models/contacts.yaml)**

```yaml
name: Contacts
type: object
key: _id
data:
  min: 1
  max: 4
properties:
  contact_id:
    data:
      build: "return chance.guid();"
  details:
    schema:
      $ref: '#/definitions/Details'
  phones:
    type: array
    items:
      $ref: '#/definitions/Phone'
      data:
        min: 1
        max: 4
  emails:
    type: array
    items:
      $ref: '#/definitions/Email'
      data:
        min: 0
        max: 3
  addresses:
    type: array
    items:
      $ref: '#/definitions/Address'
      data:
        min: 0
        max: 3
definitions:
  Email:
    data:
      build: "return faker.internet.email();"
  Phone:
    type: object
    properties:
      phone_type:
        data:
          build: "return faker.random.arrayElement(['Home', 'Work', 'Mobile', 'Main', 'Other']);"
      phone_number:
        data:
          build: "return faker.phone.phoneNumber().replace(/x[0-9]+$/, '');"
      extension:
        data:
          build: "return chance.bool({likelihood: 20}) ? '' + chance.integer({min: 1000, max: 9999}) : '';"
  Address:
    type: object
    properties:
      address_type:
        data:
          build: "return faker.random.arrayElement(['Home', 'Work', 'Other']);"
      address_1:
        data:
          build: "return faker.address.streetAddress() + ' ' + faker.address.streetSuffix();"
      address_2:
        data:
          build: "return chance.bool({likelihood: 35}) ? faker.address.secondaryAddress() : '';"
      city:
        data:
          build: "return faker.address.city();"
      state:
        data:
          build: "return faker.address.stateAbbr();"
      postal_code:
        data:
          build: "return faker.address.zipCode();"
      country:
        data:
          build: "return faker.address.countryCode();"
  Details:
    type: object
    properties:
      first_name:
        data:
          fake: "{{name.firstName}}"
      last_name:
        data:
          build: "return chance.bool({likelihood: 70})  ? faker.name.lastName() : '';"
      company:
        type: string
        description: The contacts company
        data:
          build: "return chance.bool({likelihood: 30})  ? faker.company.companyName() : '';"
      job_title:
        type: string
        description: The contacts job_title
        data:
          build: "return chance.bool({likelihood: 30})  ? faker.name.jobTitle() : '';"
```

For this model we used 4 references:

- `$ref: '#/definitions/Details'`
- `$ref: '#/definitions/Phone'`
- `$ref: '#/definitions/Email'`
- `$ref: '#/definitions/Address'`

These could have been defined inline but that would make it more difficult to see our model definition, and each of these definitions can be reused.  References are processed and included before a model is run and it's documents are generated.

### Overriding Model Defaults

The model defaults can be overwritten at run time by executing the `pre_run` function.  The `this` keyword in both the `pre_run` and `post_run` functions is the processed model.  Below are some examples of changing the number of documents the model should generate before the generation process starts.

```yaml
name: Users
type: object
key: _id
data:
  pre_run: >
    this.data.count = 100;
...
```

This becomes beneficial if you are providing input data and want to generate a fixed number of documents.  Take the following command for example:

```bash
fakeit -m countries.yaml -i countries.csv -a export.zip
```

Here we want to generate a countries model but we might not necessarily know the exact amount of data being provided by the input.  We can reference the input data in our model's `pre_run` function and set the number to generate based on the input array.

```yaml
name: Countries
type: object
key: _id
data:
  pre_run: >
    if (!inputs.countries) {
      throw new Error('countries must be provided as an input');
    }
    this.data.count = inputs.countries.length;
```

## Examples

The following examples have been provided for fakeit [https://github.com/bentonam/fakeit-examples](https://github.com/bentonam/fakeit-examples), with multiple usage examples for each.  They can be downloaded as a [Zip](https://github.com/bentonam/fakeit-examples/archive/master.zip) or by cloning the repository.

```
git clone https://github.com/bentonam/fakeit-examples.git
```

- [Contacts](https://github.com/bentonam/fakeit-examples/tree/master/contacts)
- [Ecommerce](https://github.com/bentonam/fakeit-examples/tree/master/ecommerce)
- [Flat](https://github.com/bentonam/fakeit-examples/tree/master/flat)
- [Flight Data](https://github.com/bentonam/fakeit-examples/tree/master/flight-data)
- [Music](https://github.com/bentonam/fakeit-examples/tree/master/music)
- [Simple](https://github.com/bentonam/fakeit-examples/tree/master/simple)
- [Zip Input](https://github.com/bentonam/fakeit-examples/tree/master/zip-input)
