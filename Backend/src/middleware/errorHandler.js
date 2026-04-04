'use strict';

const logger = require('../../utils/logger');

function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || err.status || 500;
  logger.error({
    event: 'api_error',
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code: err.code,
    message: err.message,
  });

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_SERVER_ERROR',
    ...(err.details ? { details: err.details } : {}),
  });
}

module.exports = { errorHandler };
