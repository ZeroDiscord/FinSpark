'use strict';

const axios = require('axios');
const rootConfig = require('../../config');
const { MlServiceUnavailableError } = require('../utils/errors');

const mlApi = axios.create({
  baseURL: rootConfig.ml.baseUrl,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': rootConfig.ml.apiKey,
  },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWithRetry(path, payload, options = {}) {
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 1000;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await mlApi.post(path, payload, {
        timeout: options.timeout ?? 30000,
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
  }

  throw new MlServiceUnavailableError(lastError?.response?.data || lastError?.message);
}

function buildFeatureSequencePayload(events) {
  const ordered = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return {
    feature_sequence: ordered.map((event) => event.l3_feature),
    duration_ms: ordered.map((event) => Number(event.duration_ms || 0)),
    success: ordered.map((event) => Boolean(event.success)),
  };
}

async function predictChurnFromEvents(events) {
  try {
    const payload = buildFeatureSequencePayload(events);
    return await postWithRetry('/predict', payload, { timeout: 30000, retries: 2 });
  } catch (error) {
    throw new MlServiceUnavailableError(error.response?.data || error.message);
  }
}

async function predictChurnFromSession(sessionPayload) {
  try {
    return await postWithRetry('/predict', sessionPayload, { timeout: 30000, retries: 2 });
  } catch (error) {
    throw new MlServiceUnavailableError(error.response?.data || error.message);
  }
}

async function ingestCsvForMl({ file_path, tenant_id, deployment_type }) {
  try {
    return await postWithRetry('/ingest', {
      file_path,
      tenant_id,
      deployment_type,
    }, { timeout: 120000, retries: 1 });
  } catch (error) {
    throw new MlServiceUnavailableError(error.response?.data || error.message);
  }
}

async function triggerModelRetrain(payload) {
  try {
    return await postWithRetry('/retrain', payload, { timeout: 120000, retries: 1 });
  } catch (error) {
    throw new MlServiceUnavailableError(error.response?.data || error.message);
  }
}

module.exports = {
  buildFeatureSequencePayload,
  predictChurnFromEvents,
  predictChurnFromSession,
  ingestCsvForMl,
  triggerModelRetrain,
  postWithRetry,
  mlApi,
};
