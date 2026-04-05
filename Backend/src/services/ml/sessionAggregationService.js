'use strict';

const { ProcessedSession } = require('../../database/models');
const { ValidationError } = require('../../utils/errors');

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeEvents(events) {
  return [...events]
    .filter((event) => event && event.session_id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function countRetries(featureSequence) {
  const seen = new Set();
  let retries = 0;

  for (const feature of featureSequence) {
    if (seen.has(feature)) retries += 1;
    else seen.add(feature);
  }

  return retries;
}

function deriveDropOffFeature(orderedEvents) {
  const failedEvent = [...orderedEvents].reverse().find((event) => event.success === false);
  return failedEvent?.l3_feature || orderedEvents[orderedEvents.length - 1]?.l3_feature || null;
}

function buildSessionSummary(events) {
  const orderedEvents = normalizeEvents(events);
  if (!orderedEvents.length) {
    throw new ValidationError('Cannot aggregate an empty session.');
  }

  const firstEvent = orderedEvents[0];
  const lastEvent = orderedEvents[orderedEvents.length - 1];
  const featureSequence = orderedEvents.map((event) => event.l3_feature);
  const durationSequence = orderedEvents.map((event) => toNumber(event.duration_ms, 0));
  const successSequence = orderedEvents.map((event) => Boolean(event.success));
  const totalDuration = durationSequence.reduce((sum, value) => sum + value, 0);
  const failureCount = successSequence.filter((value) => !value).length;
  const successCount = successSequence.filter(Boolean).length;
  const sessionStart = new Date(firstEvent.timestamp);
  const sessionEnd = new Date(lastEvent.timestamp);
  const sessionLengthMs = Math.max(0, sessionEnd.getTime() - sessionStart.getTime());

  return {
    tenant_id: String(firstEvent.tenant_id),
    session_id: String(firstEvent.session_id),
    user_id: String(firstEvent.user_id || ''),
    session_start: sessionStart,
    session_end: sessionEnd,
    feature_sequence: featureSequence,
    action_sequence: orderedEvents.map((event) => event.l4_action),
    duration_sequence_ms: durationSequence,
    success_sequence: successSequence,
    avg_duration_ms: featureSequence.length ? Math.round(totalDuration / featureSequence.length) : 0,
    total_duration_ms: totalDuration,
    session_length_ms: sessionLengthMs,
    feature_count: featureSequence.length,
    failure_count: failureCount,
    success_count: successCount,
    retry_count: countRetries(featureSequence),
    previous_feature: featureSequence.length > 1 ? featureSequence[featureSequence.length - 2] : null,
    drop_off_feature: deriveDropOffFeature(orderedEvents),
    hour_of_day: sessionStart.getUTCHours(),
    day_of_week: sessionStart.getUTCDay(),
    churn_label:
      orderedEvents
        .map((event) => (event.churn_label === undefined || event.churn_label === null ? null : Number(event.churn_label)))
        .filter((value) => value !== null)
        .slice(-1)[0] ?? null,
    source_event_count: orderedEvents.length,
    raw_events: orderedEvents.map((event) => ({
      timestamp: event.timestamp,
      l3_feature: event.l3_feature,
      l4_action: event.l4_action,
      duration_ms: toNumber(event.duration_ms, 0),
      success: Boolean(event.success),
    })),
  };
}

function buildMlPayloadFromSession(session) {
  return {
    tenant_id: session.tenant_id,
    session_sequence: session.feature_sequence || [],
    deployment_mode: session.deployment_type || 'cloud',
  };
}

async function upsertProcessedSession(sessionSummary) {
  return ProcessedSession.findOneAndUpdate(
    { tenant_id: sessionSummary.tenant_id, session_id: sessionSummary.session_id },
    { $set: sessionSummary },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = {
  normalizeEvents,
  buildSessionSummary,
  buildMlPayloadFromSession,
  upsertProcessedSession,
};
