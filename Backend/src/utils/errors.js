'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class InvalidFileError extends AppError {
  constructor(message = 'Invalid file upload.') {
    super(message, 400, 'INVALID_FILE');
  }
}

class InvalidCsvError extends AppError {
  constructor(message = 'Invalid CSV file.', details = null) {
    super(message, 400, 'INVALID_CSV', details);
  }
}

class MissingColumnsError extends AppError {
  constructor(columns) {
    super('CSV is missing required columns.', 400, 'MISSING_COLUMNS', { missing_columns: columns });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, 404, 'NOT_FOUND');
  }
}

class MlServiceUnavailableError extends AppError {
  constructor(message = 'ML service unavailable.', details = null) {
    super(message, 503, 'ML_SERVICE_UNAVAILABLE', details);
  }
}

class AsanaConnectionMissingError extends AppError {
  constructor(message = 'Asana connection missing.') {
    super(message, 400, 'ASANA_CONNECTION_MISSING');
  }
}

module.exports = {
  AppError,
  ValidationError,
  InvalidFileError,
  InvalidCsvError,
  MissingColumnsError,
  UnauthorizedError,
  NotFoundError,
  MlServiceUnavailableError,
  AsanaConnectionMissingError,
};
