'use strict';

const { AnalysisRun, MlPrediction, UsageEvent, ProcessedSession } = require('../../database/models');
const { predictChurnFromSession, triggerModelRetrain } = require('../mlService');
const {
  buildSessionSummary,
  buildMlPayloadFromSession,
  upsertProcessedSession,
} = require('./sessionAggregationService');
const { summarizePredictions } = require('./predictionDashboardService');
const { createRecommendationsForPrediction } = require('./recommendationRules');
const { ValidationError } = require('../../utils/errors');

const REALTIME_MIN_EVENTS = 3;

async function storePrediction({ session, mlPayload, mlResponse, analysisRunId, inferenceMs }) {
  return MlPrediction.create({
    tenant_id: session.tenant_id,
    session_id: session.session_id,
    processed_session_id: session._id,
    model_name: 'external_churn_predictor',
    model_version: mlResponse.model_version || 'external',
    churn_probability: Number(mlResponse.churn_probability || 0),
    drop_off_feature: mlResponse.drop_off_feature || session.drop_off_feature,
    inference_ms: inferenceMs,
    request_payload: mlPayload,
    response_payload: mlResponse,
    analysis_run_id: analysisRunId,
  });
}

async function analyzeSessionEvents(events, options = {}) {
  const analysisRun = await AnalysisRun.create({
    tenant_id: options.tenantId || events[0]?.tenant_id,
    run_type: 'ml_prediction',
    status: 'running',
    started_at: new Date(),
    input_summary: { mode: options.mode || 'manual', source_event_count: events.length },
  });

  try {
    const sessionSummary = buildSessionSummary(events);
    const processedSession = await upsertProcessedSession(sessionSummary);
    const mlPayload = buildMlPayloadFromSession(sessionSummary);
    const started = Date.now();
    const mlResponse = await predictChurnFromSession(mlPayload);
    const prediction = await storePrediction({
      session: processedSession,
      mlPayload,
      mlResponse,
      analysisRunId: analysisRun._id,
      inferenceMs: Date.now() - started,
    });

    const recommendations = await createRecommendationsForPrediction({
      session: processedSession,
      prediction,
      analysisRunId: analysisRun._id,
    });

    analysisRun.status = 'completed';
    analysisRun.finished_at = new Date();
    analysisRun.output_summary = {
      session_id: processedSession.session_id,
      churn_probability: prediction.churn_probability,
      recommendation_count: recommendations.length,
    };
    await analysisRun.save();

    return { processedSession, prediction, recommendations, analysisRun };
  } catch (error) {
    analysisRun.status = 'failed';
    analysisRun.finished_at = new Date();
    analysisRun.output_summary = { error: error.message };
    await analysisRun.save();
    throw error;
  }
}

async function analyzeTenantSessions({ tenantId, start, end, sessionIds = [] }) {
  if (!tenantId) throw new ValidationError('tenant_id is required.');

  const filter = { tenant_id: tenantId };
  if (start || end) {
    filter.timestamp = {};
    if (start) filter.timestamp.$gte = new Date(start);
    if (end) filter.timestamp.$lte = new Date(end);
  }
  if (sessionIds.length) {
    filter.session_id = { $in: sessionIds };
  }

  const events = await UsageEvent.find(filter).sort({ session_id: 1, timestamp: 1 }).lean();
  const grouped = events.reduce((acc, event) => {
    const key = event.session_id;
    acc[key] = acc[key] || [];
    acc[key].push(event);
    return acc;
  }, {});

  const sessions = Object.values(grouped).filter((items) => items.length);
  const results = [];
  for (const sessionEvents of sessions) {
    results.push(await analyzeSessionEvents(sessionEvents, { tenantId, mode: 'manual' }));
  }

  return {
    sessions_analyzed: results.length,
    predictions: results.map((item) => item.prediction),
    dashboard: summarizePredictions(results.map((item) => item.prediction)),
  };
}

async function getPredictions({ tenantId, start, end, minProbability, limit = 50 }) {
  const filter = {};
  if (tenantId) filter.tenant_id = tenantId;
  if (start || end) {
    filter.created_at = {};
    if (start) filter.created_at.$gte = new Date(start);
    if (end) filter.created_at.$lte = new Date(end);
  }
  if (minProbability !== undefined) {
    filter.churn_probability = { $gte: Number(minProbability) };
  }

  const predictions = await MlPrediction.find(filter).sort({ created_at: -1 }).limit(Number(limit) || 50).lean();
  return {
    predictions,
    dashboard: summarizePredictions(predictions),
  };
}

async function getPredictionBySessionId(sessionId, tenantId) {
  const filter = { session_id: sessionId };
  if (tenantId) filter.tenant_id = tenantId;

  const predictions = await MlPrediction.find(filter).sort({ created_at: -1 }).lean();
  return predictions;
}

async function maybePredictRealtimeForEvents(events) {
  const grouped = events.reduce((acc, event) => {
    if (!event?.session_id) return acc;
    acc[event.session_id] = acc[event.session_id] || [];
    acc[event.session_id].push(event);
    return acc;
  }, {});

  for (const sessionId of Object.keys(grouped)) {
    const sessionEvents = await UsageEvent.find({ session_id: sessionId }).sort({ timestamp: 1 }).lean();
    if (sessionEvents.length < REALTIME_MIN_EVENTS) continue;

    const existingSession = await ProcessedSession.findOne({
      tenant_id: sessionEvents[0].tenant_id,
      session_id: sessionId,
    }).lean();
    if (existingSession?.source_event_count === sessionEvents.length) continue;

    const latestEvent = sessionEvents[sessionEvents.length - 1];
    const shouldPredict =
      latestEvent.l4_action === 'close' ||
      latestEvent.success === false ||
      sessionEvents.length % REALTIME_MIN_EVENTS === 0;

    if (!shouldPredict) continue;
    await analyzeSessionEvents(sessionEvents, { tenantId: latestEvent.tenant_id, mode: 'realtime' });
  }
}

async function runRetrainTrigger({ tenantId, start, end, reason = 'scheduled' }) {
  const analysisRun = await AnalysisRun.create({
    tenant_id: tenantId || 'global',
    run_type: 'ml_prediction',
    status: 'running',
    started_at: new Date(),
    input_summary: { mode: 'retrain_trigger', tenant_id: tenantId || null, start, end, reason },
  });

  try {
    const response = await triggerModelRetrain({
      tenant_id: tenantId,
      start,
      end,
      reason,
      triggered_at: new Date().toISOString(),
    });

    analysisRun.status = 'completed';
    analysisRun.finished_at = new Date();
    analysisRun.output_summary = response;
    await analysisRun.save();

    return response;
  } catch (error) {
    analysisRun.status = 'failed';
    analysisRun.finished_at = new Date();
    analysisRun.output_summary = { error: error.message };
    await analysisRun.save();
    throw error;
  }
}

module.exports = {
  analyzeSessionEvents,
  analyzeTenantSessions,
  getPredictions,
  getPredictionBySessionId,
  maybePredictRealtimeForEvents,
  runRetrainTrigger,
};
