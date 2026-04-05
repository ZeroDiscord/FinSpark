'use strict';

const http = require('http');
const https = require('https');
const {
  analyzeTenantSessions,
  getPredictions,
  getPredictionBySessionId,
  runRetrainTrigger,
} = require('../services/ml/predictionIntegrationService');
const { postWithRetry } = require('../services/mlService');
const rootConfig = require('../../config');

async function analyze(req, res) {
  const result = await analyzeTenantSessions({
    tenantId: req.body.tenant_id,
    start: req.body.start,
    end: req.body.end,
    sessionIds: req.body.session_ids || [],
  });

  return res.status(202).json({
    success: true,
    data: result,
  });
}

async function listPredictions(req, res) {
  const result = await getPredictions({
    tenantId: req.query.tenant_id,
    start: req.query.start,
    end: req.query.end,
    minProbability: req.query.min_probability,
    limit: req.query.limit,
  });

  return res.json({
    success: true,
    data: result,
  });
}

async function getPrediction(req, res) {
  const predictions = await getPredictionBySessionId(req.params.sessionId, req.query.tenant_id);
  return res.json({
    success: true,
    data: predictions,
  });
}

async function retrain(req, res) {
  const result = await runRetrainTrigger({
    tenantId: req.body.tenant_id,
    start: req.body.start,
    end: req.body.end,
    reason: req.body.reason || 'manual',
  });

  return res.status(202).json({
    success: true,
    data: result,
  });
}

async function train(req, res) {
  const { tenant_id, augment = false } = req.body;
  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id is required.' });
  }
  const result = await postWithRetry('/train', { tenant_id, augment }, { timeout: 180000, retries: 0 });
  return res.status(200).json({ success: true, data: result });
}

/**
 * SSE proxy: streams /train/stream from the ML service to the browser.
 * The frontend connects with EventSource; this handler forwards the request
 * to Python FastAPI and pipes the SSE response back without buffering.
 */
async function trainStream(req, res) {
  const { tenant_id, augment = false } = req.body;
  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id is required.' });
  }

  // Set SSE headers before anything is written
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const mlBase = rootConfig.ml.baseUrl; // e.g. http://localhost:8000
  const url = new URL('/train/stream', mlBase);
  const body = JSON.stringify({ tenant_id, augment });
  const transport = url.protocol === 'https:' ? https : http;

  const mlReq = transport.request(
    {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-API-Key': rootConfig.ml.apiKey,
        Accept: 'text/event-stream',
      },
    },
    (mlRes) => {
      mlRes.on('data', (chunk) => {
        res.write(chunk);
        // flush if the response object supports it (compression middleware)
        if (typeof res.flush === 'function') res.flush();
      });
      mlRes.on('end', () => res.end());
      mlRes.on('error', (err) => {
        res.write(`event: error\ndata: ${JSON.stringify({ detail: err.message })}\n\n`);
        res.end();
      });
    },
  );

  mlReq.on('error', (err) => {
    res.write(`event: error\ndata: ${JSON.stringify({ detail: err.message })}\n\n`);
    res.end();
  });

  // Close ML connection when browser disconnects
  req.on('close', () => mlReq.destroy());

  mlReq.write(body);
  mlReq.end();
}

module.exports = {
  analyze,
  listPredictions,
  getPrediction,
  retrain,
  train,
  trainStream,
};
