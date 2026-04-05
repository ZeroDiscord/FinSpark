'use strict';

const { sanitizeMetadata } = require('./sanitizer');
const { normalizeEvent } = require('./validator');
const UsageEvent = require('../../database/models/UsageEvent');
const Tenant = require('../../database/models/Tenant');
const { maybePredictRealtimeForEvents } = require('../ml/predictionIntegrationService');

async function ingestEvents(payload) {
  const rawEvents = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : [payload];
  const events = rawEvents.map((event) => {
    const normalized = normalizeEvent(event);
    return {
      ...normalized,
      metadata: sanitizeMetadata(normalized.metadata),
    };
  });

  if (events.length > 0) {
    const tenantId = events[0].tenant_id;
    const tenant = await Tenant.findOne({ tenant_key: tenantId }).lean();
    if (tenant && tenant.settings && tenant.settings.tracking_consent === false) {
      // Consent is revoked, drop the events
      return {
        accepted: 0,
        session_ids: [],
        message: 'Telemetry dropped due to tracking_consent=false'
      };
    }
  }

  await UsageEvent.insertMany(events, { ordered: false }).catch(() => null);
  // Fire-and-forget — do not block the response waiting for ML inference
  setImmediate(() => maybePredictRealtimeForEvents(events).catch(() => null));

  return {
    accepted: events.length,
    session_ids: [...new Set(events.map((event) => event.session_id))],
  };
}

module.exports = { ingestEvents };
