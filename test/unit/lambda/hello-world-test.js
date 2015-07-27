import factory from 'lambda-handler';
import path from 'path';
import sinon from 'sinon';
import assert from 'power-assert';

const handlerPath = path.resolve('./lambda/hello-josh/index.js');
const fixturePath = path.resolve('./test/fixtures/debug');

describe('Hello world test', () => {
  let handler;
  let event;
  let context;

  beforeEach(factory(handlerPath, fixturePath, function(_handler, _event, _context) {
    handler = _handler;
    event = _event;
    context = _context;
  }));

  let log;
  beforeEach(function() {
    log = console.log;
    console.log = function() {};
  });

  afterEach(function() {
    console.log = log;
  });

  it('should call to success', function() {
    console.log = sinon.spy(console, 'log');
    context.done = sinon.spy(context, 'done');

    handler(event, context);

    assert(console.log.calledWith(JSON.stringify(event)));
    assert(context.done.calledWith(null));
  });
});

