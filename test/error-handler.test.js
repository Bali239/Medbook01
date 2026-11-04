import test from 'node:test';
import assert from 'node:assert/strict';
import errorHandler from '../src/middleware/errorHandler.js';

const captureResponse = () => ({
  code: undefined,
  body: undefined,
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('operational errors keep their safe status and user-facing message', () => {
  const response = captureResponse();
  errorHandler({ statusCode: 403, status: 'fail', isOperational: true, message: 'You cannot update this profile.' }, {}, response, () => {});

  assert.equal(response.code, 403);
  assert.equal(response.body.message, 'You cannot update this profile.');
  assert.equal('stack' in response.body, false);
  assert.equal('error' in response.body, false);
});

test('unexpected errors return generic copy and keep stack details out of the response', () => {
  const response = captureResponse();
  const originalError = console.error;
  let loggedError;
  console.error = (_label, error) => { loggedError = error; };
  try {
    errorHandler(new Error('database connection string'), {}, response, () => {});
  } finally {
    console.error = originalError;
  }

  assert.equal(response.code, 500);
  assert.equal(response.body.message, 'We could not complete your request. Please try again.');
  assert.doesNotMatch(JSON.stringify(response.body), /database connection string/);
  assert.match(loggedError.stack, /database connection string/);
});