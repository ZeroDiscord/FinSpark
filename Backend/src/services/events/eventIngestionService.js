'use strict';

const { query } = require('../../../db/client');
const { sanitizeMetadata } = require('./sanitizer');
const { normalizeEvent } = require('./validator');
const UsageEvent = require('../../database/models/UsageEvent');

async function insertEventRow(event) {
  await query(
    `INSERT INTO events (
      tenant_id, session_id, user_id, timestamp, deployment_type, channel, l1_domain, l2_module,
      l3_feature, l4_action, l5_deployment_node, duration_ms, success, metadata, feedback_text, churn_label
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      event.tenant_id,
      event.session_id,
      event.user_id,
      event.timestamp,
      event.deployment_type,
      event.channel,
      event.l1_domain,
      event.l2_module,
      event.l3_feature,
      event.l4_action,
      event.l5_deployment_node,
      event.duration_ms,
      event.success,
      JSON.stringify(event.metadata || {}),
      event.feedback_text,
      event.churn_label,
    ]
  );
}

async function ingestEvents(payload) {
  const rawEvents = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : [payload];
  const events = rawEvents.map((event) => {
    const normalized = normalizeEvent(event);
    return {
      ...normalized,
      metadata: sanitizeMetadata(normalized.metadata),
    };
  });

  for (const event of events) {
    await insertEventRow(event);
  }

  if (UsageEvent?.db?.readyState === 1) {
    await UsageEvent.insertMany(events, { ordered: false }).catch(() => null);
  }

  return {
    accepted: events.length,
    session_ids: [...new Set(events.map((event) => event.session_id))],
  };
}

module.exports = { ingestEvents };
