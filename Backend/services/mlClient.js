'use strict';

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const mlClient = axios.create({
  baseURL: config.ml.baseUrl,
  timeout: 120_000, // 2 min — training can be slow
  headers: {
    'X-API-Key': config.ml.apiKey,
    'Content-Type': 'application/json',
  },
});

mlClient.interceptors.request.use((req) => {
  logger.debug({ event: 'ml_request', method: req.method, url: req.url });
  return req;
});

mlClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const detail = err.response?.data?.detail || err.message;
    logger.error({ event: 'ml_error', status, detail });
    const error = new Error(`ML service error: ${detail}`);
    error.status = status || 502;
    return Promise.reject(error);
  }
);

module.exports = mlClient;
