'use strict';

const {
  analyzeTenantSessions,
  getPredictions,
  getPredictionBySessionId,
  runRetrainTrigger,
} = require('../services/ml/predictionIntegrationService');

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

module.exports = {
  analyze,
  listPredictions,
  getPrediction,
  retrain,
};
