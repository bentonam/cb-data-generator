/* eslint-disable no-undefined */

import Couchbase from '../../dist/output/couchbase';
import default_options from '../../dist/output/default-options';
import to from 'to-js';
import ava from 'ava-spec';
import sinon from 'sinon';

const test = ava.group('output:couchbase');
const username = 'test';
const password = 'test';

test.beforeEach((t) => {
  t.context = new Couchbase({}, { username, password });
  t.context.cluster = sinon.mock(Couchbase.prototype);
});

test.afterEach(() => {
  sinon.resetBehavior();
  sinon.restore();
});

test('without args', (t) => {
  default_options.username = username;
  default_options.password = password;
  t.deepEqual(t.context.output_options, default_options);
  t.is(t.context.prepared, false);
  t.is(typeof t.context.prepare, 'function');
  t.is(typeof t.context.output, 'function');
  t.is(t.context.cluster.constructor.name, 'Object');
});

test('prepare', async (t) => {
  t.context.cluster.bucket = sinon.fake.returns({
    defaultCollection: sinon.stub().callsFake(() => {
      return {
        upsert: sinon.stub().callsFake(() => {
          return Promise.resolve({
            cas: 23423497,
            token: 'asldfj923249-asdf2bh234-2kchadr',
          });
        }),
      };
    })
  });

  t.is(t.context.prepared, false);
  t.is(t.context.preparing, undefined);

  const preparing = t.context.prepare();

  await preparing;

  t.is(t.context.prepared, true);
  t.is(to.type(t.context.bucket), 'object');
  t.is(t.context.bucket.connected, true);
});

test.group('setup', (test) => {
  test('returns an exception when a bucket is not found', async (t) => {
    t.context.cluster.bucket = null;

    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);

    try {
      await t.context.setup();
      // If we get here then fail the test because we are
      // expecting a failure with this test
      t.fail();
    } catch (e) {
      t.pass();
    }
  });
});

test.group('output', (test) => {
  const languages = {
    cson: to.normalize(`
      [
        {
          id: 302672
          code: "AD"
          name: "Andorra"
          continent: "EU"
        }
        {
          id: 302618
          code: "AE"
          name: "United Arab Emirates"
          continent: "AS"
        }
      ]
    `),
    csv: to.normalize(`
      id,code,name,continent
      302672,AD,Andorra,EU
      302618,AE,United Arab Emirates,AS
      302619,AF,Afghanistan,AS
      302722,AG,Antigua and Barbuda,NA
      302723,AI,Anguilla,NA
      302673,AL,Albania,EU
      302620,AM,Armenia,AS
      302556,AO,Angola,AF
      302615,AQ,Antarctica,AN
      302789,AR,Argentina,SA
      302763,AS,American Samoa,OC
      302674,AT,Austria,EU
      302764,AU,Australia,OC
      302725,AW,Aruba,NA
      302621,AZ,Azerbaijan,AS
      302675,BA,Bosnia and Herzegovina,EU
    `),
    json: to.json([
      {
        id: 302672,
        code: 'AD',
        name: 'Andorra',
        continent: 'EU'
      },
      {
        id: 302618,
        code: 'AE',
        name: 'United Arab Emirates',
        continent: 'AS'
      },
    ]),
    yaml: to.normalize(`
      -
        id: 302672
        code: AD
        name: Andorra
        continent: EU
      -
        id: 302618
        code: AE
        name: 'United Arab Emirates'
        continent: AS
      -
        id: 302619
        code: AF
        name: Afghanistan
        continent: AS
    `)
  };

  for (let language of to.keys(languages)) {
    const data = languages[language];
    test.serial(language, async (t) => {
      t.context.cluster.bucket = sinon.fake.returns({
        defaultCollection: sinon.stub().callsFake(() => {
          return {
            get: sinon.stub().callsFake(() => {
              // GetResult: https://docs.couchbase.com/sdk-api/couchbase-node-client/global.html#GetResult
              return Promise.resolve({
                content: data,
                cas: 12345487634,
              });
            }),
            upsert: sinon.stub().callsFake(() => {
              return Promise.resolve({
                cas: 23423497,
                token: 'asldfj923249-asdf2bh234-2kchadr',
              });
            }),
          };
        })
      });

      t.context.output_options.bucket = `output-${language}`;
      const id = `1234567890-${language}`;
      t.context.output_options.format = language;
      const result = await t.context.output(id, data);
      t.is(result.cas, 23423497);
      t.is(result.token, 'asldfj923249-asdf2bh234-2kchadr');
      const document = await t.context.bucket.defaultCollection().get(id);
      t.not(document, undefined);
      t.deepEqual(document.content, data);
    });
  }

  test('prepare has started but isn\'t complete', async (t) => {
    const language = 'json';
    const data = languages[language];

    t.context.cluster.bucket = sinon.fake.returns({
      defaultCollection: sinon.stub().callsFake(() => {
        return {
          get: sinon.stub().callsFake(() => {
            // GetResult: https://docs.couchbase.com/sdk-api/couchbase-node-client/global.html#GetResult
            return Promise.resolve({
              content: data,
              cas: 12345487634,
            });
          }),
          upsert: sinon.stub().callsFake(() => {
            return Promise.resolve({
              cas: 23423497,
              token: 'asldfj923249-asdf2bh234-2kchadr',
            });
          }),
        };
      })
    });


    t.context.output_options.bucket = `output-${language}`;
    const id = `1234567890-${language}`;
    t.context.output_options.format = language;
    t.context.prepare();
    await t.context.output(id, data);
    const document = await t.context.bucket.defaultCollection().get(id);
    t.not(document, undefined);
    t.deepEqual(document.content, data);
  });
});

test.group('finalize', (test) => {
  test('do nothing because prepare wasn\'t called before finalize', async (t) => {
    await t.context.finalize();
    t.is(t.context.bucket, undefined);
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
  });

  test('disconnected', async (t) => {
    t.context.cluster.close = sinon.stub().callsFake(() => {
      return '';
    });
    t.context.cluster.bucket = sinon.fake.returns({
      connected: sinon.stub().onFirstCall().resolves(true).onSecondCall().resolves(false),
      defaultCollection: sinon.stub().callsFake(() => {
        return {};
      })
    });

    t.context.output_options.bucket = 'finalize';

    await t.context.prepare();

    t.is(to.type(t.context.bucket), 'object');
    t.is(t.context.prepared, true);
    t.is(t.context.bucket.connected, true);

    await t.context.finalize();

    t.is(to.type(t.context.bucket), 'object');
    t.is(t.context.prepared, true);
    t.is(t.context.bucket.connected, false);
  });
});
