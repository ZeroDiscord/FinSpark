'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { UnauthorizedError } = require('../utils/errors');

function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header.'));
  }

  try {
    req.user = jwt.verify(header.slice(7), config.jwt.secret);
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      const err = new UnauthorizedError('Token expired.');
      err.code = 'TOKEN_EXPIRED';
      return next(err);
    }
    return next(new UnauthorizedError('Invalid token.'));
  }
}

module.exports = { requireAuth };
