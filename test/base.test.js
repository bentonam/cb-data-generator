/* eslint-disable id-length, no-shadow */

import { join as p } from 'path';
import ava from 'ava-spec';
import to from 'to-js';
import Base from '../dist/base';
const test = ava.group('base:');

test('without args', (t) => {
  const base = new Base();
  const expectedBase = JSON.stringify({
    // inherited from events-async
    _events: {},
    _eventsCount: 0,
    _maxListeners: 50,

    options: {
      root: process.cwd(),
      log: true,
      verbose: false,
      spinners: true,
      timestamp: true,
    },
    log_types: {
      error: 'red',
      warning: 'yellow',
      success: 'green',
      info: 'blue',
      verbose: 'magenta',
      log: 'gray',
    },
    spinners: {},
  });
  t.deepEqual(JSON.stringify(base), expectedBase);
});


test('with args', (t) => {
  const base = new Base({ log: false });
  const expectedBase = JSON.stringify({
    // inherited from events-async
    _events: {},
    _eventsCount: 0,
    _maxListeners: 50,

    options: {
      root: process.cwd(),
      log: false,
      verbose: false,
      spinners: false,
      timestamp: true,
    },
    log_types: {
      error: 'red',
      warning: 'yellow',
      success: 'green',
      info: 'blue',
      verbose: 'magenta',
      log: 'gray',
    },
    spinners: {},
  });

  t.deepEqual(JSON.stringify(base), expectedBase);
});

test('when options.verbose is true, it forces options.log to also be true', (t) => {
  const base = new Base({
    log: false,
    verbose: true,
  });
  t.is(base.options.log, true);
  t.is(base.options.verbose, true);
});

test.group('functions', (test) => {
  test.group('resolvePaths', (test) => {
    test.beforeEach((t) => {
      t.context = new Base();
    });

    function paths(prefix = process.cwd()) {
      return [ 'one', 'two', 'three', 'four' ].map((str) => p(prefix, str));
    }

    test('no args', (t) => {
      t.is(to.type(t.context.resolvePaths()), 'array', 'should return an empty array');
      t.pass();
    });

    test('passed a string with 1 path', (t) => {
      t.deepEqual(t.context.resolvePaths('one'), [ p(process.cwd(), 'one') ]);
    });

    test('passed a string with multiple paths as a comma delimited list without spaces', (t) => {
      const [ one, two, three, four ] = paths();
      t.deepEqual(t.context.resolvePaths('one,two'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one,two,three'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one,two,three,four'), [ one, two, three, four ]);
    });

    test('passed a string with multiple paths as a comma delimited list with spaces', (t) => {
      const [ one, two, three, four ] = paths();
      t.deepEqual(t.context.resolvePaths('one, two'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one ,two'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one , two'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one, two, three'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one ,two ,three'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one , two , three'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one, two, three, four'), [ one, two, three, four ]);
      t.deepEqual(t.context.resolvePaths('one ,two ,three ,four'), [ one, two, three, four ]);
      t.deepEqual(t.context.resolvePaths('one , two , three , four'), [ one, two, three, four ]);
    });

    test('passed a string with multiple paths as a space delimited list', (t) => {
      const [ one, two, three, four ] = paths();
      t.deepEqual(t.context.resolvePaths('one two'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one        two'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one two three'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one        two        three'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one two three four'), [ one, two, three, four ]);
      t.deepEqual(t.context.resolvePaths('one        two        three        four'), [ one, two, three, four ]);
    });

    test('passed a string with extra commas', (t) => {
      const [ one, two, three, four ] = paths();
      t.deepEqual(t.context.resolvePaths('one,two,'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one,two,three,'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one,two,three,four'), [ one, two, three, four ]);
      t.deepEqual(t.context.resolvePaths('one ,two ,'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one ,two ,three ,'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one ,two ,three ,four ,'), [ one, two, three, four ]);
      t.deepEqual(t.context.resolvePaths('one  ,  two  ,  '), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one  ,  two  ,  three  ,  '), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one  ,  two  ,  three  ,  four  ,  '), [ one, two, three, four ]);
    });

    test('passed a string with staring/trailing spaces', (t) => {
      const [ one, two, three ] = paths();
      t.deepEqual(t.context.resolvePaths('one two  '), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('   one    ,    two      '), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('  one two, three'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('    one ,two        three'), [ one, two, three ]);
    });

    test('passed a array with normal paths', (t) => {
      const [ one, two, three, four ] = paths();
      t.deepEqual(t.context.resolvePaths([ 'one' ]), [ one ]);
      t.deepEqual(t.context.resolvePaths([ 'one', 'two' ]), [ one, two ]);
      t.deepEqual(t.context.resolvePaths([ 'one', 'two', 'three' ]), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths([ 'one', 'two', 'three', 'four' ]), [ one, two, three, four ]);
    });

    test('passed a array with nested comma paths', (t) => {
      const [ one, two, three, four ] = paths();
      t.deepEqual(t.context.resolvePaths([ '   one,   ' ]), [ one ]);
      t.deepEqual(t.context.resolvePaths([ 'one, two' ]), [ one, two ]);
      t.deepEqual(t.context.resolvePaths([ 'one ,two', ', three   ' ]), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths([ 'one', 'two    ,three', ',    four   ,' ]), [ one, two, three, four ]);
    });

    test('passed a array with nested spaced paths', (t) => {
      const [ one, two, three, four ] = paths();
      t.deepEqual(t.context.resolvePaths([ '   one   ' ]), [ one ]);
      t.deepEqual(t.context.resolvePaths([ 'one two' ]), [ one, two ]);
      t.deepEqual(t.context.resolvePaths([ 'one two', ' three   ' ]), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths([ 'one', 'two    three', '    four   ' ]), [ one, two, three, four ]);
    });

    test('with different root', (t) => {
      t.context.options.root = 'wooohoooo';
      const [ one, two, three, four ] = paths('wooohoooo');
      t.deepEqual(t.context.resolvePaths('one, '), [ one ]);
      t.deepEqual(t.context.resolvePaths('one, two'), [ one, two ]);
      t.deepEqual(t.context.resolvePaths('one, two, three'), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths('one, two, three, four'), [ one, two, three, four ]);
      t.deepEqual(t.context.resolvePaths([ 'one, ' ]), [ one ]);
      t.deepEqual(t.context.resolvePaths([ 'one, two' ]), [ one, two ]);
      t.deepEqual(t.context.resolvePaths([ 'one', 'two', 'three' ]), [ one, two, three ]);
      t.deepEqual(t.context.resolvePaths([ 'one', 'two, three', 'four' ]), [ one, two, three, four ]);
    });
  });
});
