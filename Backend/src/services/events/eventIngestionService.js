'use strict';

const { sanitizeMetadata } = require('./sanitizer');
const { normalizeEvent } = require('./validator');
const UsageEvent = require('../../database/models/UsageEvent');
const { maybePredictRealtimeForEvents } = require('../ml/predictionIntegrationService');
const kafkaProducer = require('../kafka/kafkaProducer');

async function ingestEvents(payload) {
  const rawEvents = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : [payload];
  const events = rawEvents.map((event) => {
    const normalized = normalizeEvent(event);
    return {
      ...normalized,
      metadata: sanitizeMetadata(normalized.metadata),
    };
  });

  await UsageEvent.insertMany(events, { ordered: false }).catch(() => null);

  // Publish to Kafka (fire-and-forget; no-op if Kafka not configured)
  setImmediate(() => kafkaProducer.publishEvents(events).catch(() => null));

  // Fire-and-forget — do not block the response waiting for ML inference
  setImmediate(() => maybePredictRealtimeForEvents(events).catch(() => null));

  return {
    accepted: events.length,
    session_ids: [...new Set(events.map((event) => event.session_id))],
  };
}

module.exports = { ingestEvents };
