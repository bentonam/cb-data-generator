/* eslint-disable id-length, no-shadow, no-undefined */
import to from 'to-js';
import proxyquire from 'proxyquire';
import req from 'request';
function mockRequest(options, callback) {
  callback(null, { headers: { 'set-cookie': true } }, { ok: true });
}
to.extend(mockRequest, req);
const { request, default: SyncGateway } = proxyquire('../../dist/output/sync-gateway', { request: mockRequest });
import default_options from '../../dist/output/default-options';
import ava from 'ava-spec';

const test = ava.group('output:sync-gateway');

test.beforeEach((t) => {
  t.context = new SyncGateway();
});

test('without args', (t) => {
  t.deepEqual(t.context.output_options, default_options);
  t.is(t.context.prepared, false);
  t.is(typeof t.context.prepare, 'function');
  t.is(typeof t.context.output, 'function');
});

test.group('prepare', (test) => {
  test('no username and password', async (t) => {
    t.context.output_options.bucket = 'prepare';
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.prepare();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    // t.is(t.context.prepared, true);
  });
});

test.serial.group('setup', (test) => {
  test('no username and password', async (t) => {
    t.context.output_options.bucket = 'setup';
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.setup();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    // t.is(t.context.prepared, true);
  });

  // NO IDEA HOW THE HELL TO WRITE UNIT TESTS FOR THIS CRAP
  test.skip('authentication', async (t) => {
    t.context.output_options.bucket = 'setup';
    t.context.output_options.username = 'Administrator';
    t.context.output_options.password = 'password';
    t.is(t.context.prepared, false);
    t.is(t.context.preparing, undefined);
    const preparing = t.context.setup();
    t.is(typeof t.context.preparing.then, 'function');
    t.is(t.context.prepared, false);
    await preparing;
    t.is(t.context.prepared, true);
  });
});

test.group('output', (test) => {
  // currently can't test this
  test.todo();
});

// this is just calling another library and it's just converting
// it's callback style to a promise style so we just need to ensure
// it's a promise.
test('request', async (t) => {
  let actual = request('localhost:3000');
  t.is(typeof actual.then, 'function');
  actual = await actual;
  t.is(to.type(actual), 'array');
  t.is(to.type(actual[0]), 'object');
  t.is(to.type(actual[1]), 'object');
});
