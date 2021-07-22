/* eslint-disable id-length, no-shadow */

import Console from '../../dist/output/console';
import default_options from '../../dist/output/default-options';
import to from 'to-js';
import stripAnsi from 'strip-ansi';
import ava from 'ava-spec';

const test = ava.group('output:console');

test.beforeEach((t) => {
  t.context = new Console();
});

test('without args', (t) => {
  t.deepEqual(t.context.output_options, default_options);
  t.is(t.context.prepared, false);
  t.is(typeof t.context.prepare, 'function');
  t.is(typeof t.context.output, 'function');
});

test('prepare', async (t) => {
  t.is(t.context.prepared, false);
  t.is(t.context.preparing, undefined); // eslint-disable-line
  const preparing = t.context.prepare();
  t.is(typeof t.context.preparing.then, 'function');
  t.is(t.context.prepared, false);
  await preparing;
  t.is(t.context.prepared, true);
});

test.serial('setup', async (t) => {
  t.is(t.context.prepared, false);
  t.is(t.context.preparing, undefined); // eslint-disable-line
  const preparing = t.context.setup();
  t.is(typeof t.context.preparing.then, 'function');
  t.is(t.context.prepared, false);
  await preparing;
  t.is(t.context.prepared, true);
});

// These tests must be run in order since they're testing the console output.
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
    test(`${language}`, async (t) => {
      t.context.output_options.format = language;
      t.is(t.context.prepared, false);
      t.is(t.context.preparing, undefined); // eslint-disable-line
      const actual = await t.context.output(null, data);
      t.is(t.context.prepared, true);
      // t.not(actual.trim(), data);
      t[language !== 'csv' ? 'is' : 'not'](stripAnsi(actual).trim(), data);
    });
  }
});
