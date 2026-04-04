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
    const response = await mlApi.post('/predict', payload);
    return response.data;
  } catch (error) {
    throw new MlServiceUnavailableError(error.response?.data || error.message);
  }
}

async function ingestCsvForMl({ file_path, tenant_id, deployment_type }) {
  try {
    const response = await mlApi.post('/ingest', {
      file_path,
      tenant_id,
      deployment_type,
    });
    return response.data;
  } catch (error) {
    throw new MlServiceUnavailableError(error.response?.data || error.message);
  }
}

module.exports = {
  buildFeatureSequencePayload,
  predictChurnFromEvents,
  ingestCsvForMl,
  mlApi,
};
