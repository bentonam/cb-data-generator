/* eslint-disable no-undefined */
import ava from 'ava-spec';
import Logger from '../dist/logger';
import to from 'to-js';
import { stdout } from 'test-console';
import stripAnsi from 'strip-ansi';
import { PassThrough as PassThroughStream } from 'stream';
import _ from 'lodash';
import getStream from 'get-stream';
const test = ava.group('logger:');
import formatSeconds from 'format-seconds';
const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

test.beforeEach((t) => {
  t.context = new Logger();
});


test('functions', (t) => {
  t.deepEqual(
    to.keys(Logger.prototype).sort(),
    [ 'constructor', 'log', 'spinner', 'stamp', 'time', 'timeEnd' ].sort()
  );
});


test.group('options', (test) => {
  test('none', (t) => {
    t.deepEqual(t.context.options, { log: true, verbose: false, spinners: true, timestamp: true });
  });

  test('log is false', (t) => {
    const logger = new Logger({ log: false });
    t.deepEqual(logger.options, { log: false, verbose: false, spinners: false, timestamp: true });
  });

  test('log is false and verbose is true', (t) => {
    const logger = new Logger({ log: false, verbose: true });
    t.deepEqual(logger.options, { log: true, verbose: true, spinners: true, timestamp: true });
  });
});


test.serial.group('log', (test) => {
  test('returns this', (t) => {
    const inspect = stdout.inspect();
    const actual = t.context.log();
    inspect.restore();
    t.is(actual.constructor.name, 'Logger');
  });

  const log_types = [ 'warning', 'success', 'info', 'verbose', 'log' ];

  log_types.forEach((type) => {
    test(type, (t) => {
      t.context.options.verbose = true;
      const inspect = stdout.inspect();
      t.context.log(type, `${type} test`);
      inspect.restore();
      t.is(inspect.output.length, 2);
      t.is(inspect.output[1].trim(), `${type} test`);
      if (![ 'warning', 'info' ].includes(type)) {
        type = '';
      }
      t.truthy(new RegExp(`^\\[[0-9]+:[0-9]+:[0-9]+\\]\\s(?:.+)?\\s*${type}:?\\s*$`).test(stripAnsi(inspect.output[0])));
    });
  });

  test.group('throws error', (test) => {
    const regex = /^\[[0-9]+:[0-9]+:[0-9]+\]\s.+\serror:\s*$/;
    test('when string is passed as the type', (t) => {
      const tester = () => t.context.log('error', 'woohoo');
      const inspect = stdout.inspect();
      t.throws(tester);
      inspect.restore();
      t.is(inspect.output.length, 2);
      t.is(inspect.output[1].trim(), 'woohoo');
      t.truthy(regex.test(stripAnsi(inspect.output[0])));
    });

    test('when error constructor is passed as the first argument', (t) => {
      const tester = () => t.context.log(new Error('woohoo'));
      const inspect = stdout.inspect();
      t.throws(tester);
      inspect.restore();
      t.is(inspect.output.length, 2);
      let [ message, ...err_lines ] = inspect.output[1].split('\n');
      t.truthy(/\[?Error: woohoo\]?/.test(message.trim()));
      err_lines.forEach((line) => {
        line = stripAnsi(line.trim());
        if (line) {
          t.truthy(line.match(/^\s*at/));
        }
      });
      t.truthy(regex.test(stripAnsi(inspect.output[0])));
    });
  });

  test('time and timeEnd', async (t) => {
    const time = t.context.log('time', 'woohoo');
    t.is(time.constructor.name, 'Logger');
    await delay(200);
    const end = t.context.log('timeEnd', 'woohoo');
    const woohoo = parseFloat(end.match(/\+([0-9\.]+)/)[1]);
    t.truthy(woohoo > 190);
  });
});


test.serial.group('time', (test) => {
  test('throws when no label is passed (time)', (t) => {
    const tester = () => t.context.time();
    const inspect = stdout.inspect();
    t.throws(tester);
    inspect.restore();
    t.truthy(/^\[[0-9]+:[0-9]+:[0-9]+\]\s.+\serror:\s*$/.test(stripAnsi(inspect.output[0])));
    t.is(inspect.output.length, 2);
    t.is(inspect.output[1].split('\n')[0], 'You must pass in a label for `Logger.prototype.time`');
  });

  test('throws when no label is passed (timeEnd)', (t) => {
    const tester = () => t.context.timeEnd();
    const inspect = stdout.inspect();
    t.throws(tester);
    inspect.restore();
    t.truthy(/^\[[0-9]+:[0-9]+:[0-9]+\]\s.+\serror:\s*$/.test(stripAnsi(inspect.output[0])));
    t.is(inspect.output.length, 2);
    t.is(inspect.output[1].split('\n')[0], 'You must pass in a label for `Logger.prototype.timeEnd`');
  });

  test('returns this', (t) => {
    const actual = t.context.time('returns');
    t.is(actual.constructor.name, 'Logger');
  });

  test.serial.group((test) => {
    let number = 0.0000025;
    const tests = _.times(9, () => {
      number *= 10;
      return number;
    });

    tests.forEach((time) => {
      const expected = formatSeconds(time);
      test(expected, async (t) => {
        t.context.time(expected);
        await delay(time);
        const actual = t.context.timeEnd(expected);
        t.truthy(actual);
        t.is(typeof actual, 'string');
        const [ number, unit ] = stripAnsi(actual).trim().match(/\+?([0-9\.]+)\s*([µmsn]+)?/).slice(1);
        if (number !== '0') {
          t.is(typeof unit, 'string');
          t.truthy([ 'µs', 'ns', 'ms', 's', ].includes(unit));
        }
        t.is(typeof parseFloat(number), 'number');
      });
    });
  });
});


test.serial.group('spinner', (test) => {
  function getPassThroughStream() {
    const stream = new PassThroughStream();
    stream.clearLine = _.noop;
    stream.cursorTo = _.noop;
    return stream;
  }

  test('returns a modified instance of Ora', (t) => {
    const actual = t.context.spinner('instance');
    t.is(actual.constructor.name, 'Ora');
    t.is(actual.title, 'instance');
    t.is(actual.text, 'instance');
    t.is(typeof actual.originalStart, 'function');
    t.is(typeof actual.originalStop, 'function');
    t.truthy(/this\.originalStop\(\);/.test(actual.stopAndPersist.toString()));
  });

  test.serial('start/stop/stopAndPersist do nothing in TTY env', async (t) => {
    const actual = t.context.spinner('woohoo');
    const inspect = stdout.inspect();
    const start_result = actual.start();
    await delay(200);
    const stop_result = actual.stop();
    actual.start();
    const stop_and_persist_result = actual.stopAndPersist('✔');
    inspect.restore();
    t.is(start_result.constructor.name, 'Ora');
    t.is(stop_result.constructor.name, 'Ora');
    t.is(stop_and_persist_result.constructor.name, 'Ora');
    t.deepEqual(inspect.output, []);
  });

  test('start/stop custom stream', async (t) => {
    const stream = getPassThroughStream();
    const actual = t.context.spinner({ stream, text: 'stop__', color: false, isEnabled: true });
    actual.start();
    await delay(200);
    actual.stop();
    stream.end();
    const output = await getStream(stream);
    output.trim().split('__').filter(Boolean).forEach((state) => {
      const [ frame, text ] = state.split(/\s+/);
      t.truthy(actual.spinner.frames.includes(frame));
      t.is(text, 'stop');
    });
  });

  test('start/stop custom stream with verbose option', async (t) => {
    const inspect = stdout.inspect();
    const stream = getPassThroughStream();
    t.context.options.verbose = true;
    const actual = t.context.spinner({ stream, text: 'stop__', color: false, isEnabled: true });
    actual.start();
    await delay(200);
    actual.stop();
    stream.end();
    inspect.restore();

    const states = stripAnsi(inspect.output).toString().trim().replace(/,/g, '').split('__');

    const last_state = states.splice(-2, 2).join('');
    states.filter(Boolean).forEach((state) => {
      const [ frame, text ] = state.split(/\s+/);
      t.truthy(actual.spinner.frames.includes(frame));
      t.is(text, 'stop');
    });
    {
      const [ check, text, time, unit ] = last_state.split(/\s+/);
      t.is(check, '✔');
      t.is(text, 'stop');
      t.truthy(/^\+2[0-9]{2}\sms$/.test(`${time} ${unit}`));
    }
  });

  test.serial('fail custom stream', async (t) => {
    const stream = getPassThroughStream();
    const [ one, two, three ] = [ 'one', 'two', 'three' ].map((str) => {
      return t.context.spinner({ stream, text: `${str}__`, color: false, isEnabled: true });
    });
    const inspect = stdout.inspect();
    one.start();
    two.start();
    three.start();
    t.truthy(one.id);
    t.truthy(two.id);
    t.truthy(three.id);
    const tester = () => three.fail('failed');
    t.throws(tester);
    stream.end();
    inspect.restore();
    t.is(one.id, undefined);
    t.is(two.id, undefined);
    t.is(three.id, undefined);
    t.truthy(/error: failed/.test(stripAnsi(inspect.output.join(''))));

    const states = stripAnsi(inspect.output).toString().trim().replace(/,/g, '').split('__');
    states.pop();

    const last_state = states.pop();
    states.forEach((state) => {
      const [ frame, text ] = state.split(/\s+/);
      t.truthy(frame);
      t.truthy([ 'one', 'two', 'three' ].includes(text));
    });

    {
      const [ check, text ] = last_state.split(/\s+/);
      t.is(check, '✖');
      t.is(text, 'three');
    }
  });

  test('spinner already exists so return it', (t) => {
    t.deepEqual(t.context.spinners, {});
    _.times(2, () => t.context.spinner('exists'));
    t.deepEqual(_.keys(t.context.spinners), [ 'exists' ]);
  });
});
