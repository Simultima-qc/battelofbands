'use strict';

class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    Object.assign(this, details);
  }
}

function asyncRoute(handler) {
  return function wrappedAsyncRoute(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { HttpError, asyncRoute };
