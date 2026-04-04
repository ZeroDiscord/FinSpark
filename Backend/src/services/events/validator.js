'use strict';

const { ValidationError } = require('../../utils/errors');

const REQUIRED_FIELDS = [
  'tenant_id',
  'session_id',
  'user_id',
  'timestamp',
  'deployment_type',
  'channel',
  'l1_domain',
  'l2_module',
  'l3_feature',
  'l4_action',
  'l5_deployment_node',
];

function validateEvent(event) {
  const missing = REQUIRED_FIELDS.filter((field) => !event[field] && event[field] !== false && event[field] !== 0);
  if (missing.length) {
    throw new ValidationError(`Missing required event fields: ${missing.join(', ')}`);
  }

  if (!event.tenant_id || !String(event.tenant_id).trim()) {
    throw new ValidationError('tenant_id is required.');
  }

  if (!event.l3_feature || !String(event.l3_feature).trim()) {
    throw new ValidationError('l3_feature must not be empty.');
  }

  if (event.duration_ms !== undefined && Number.isNaN(Number(event.duration_ms))) {
    throw new ValidationError('duration_ms must be numeric.');
  }

  const parsedDate = new Date(event.timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new ValidationError('timestamp must be a valid ISO datetime.');
  }
}

function normalizeEvent(event) {
  validateEvent(event);
  return {
    tenant_id: String(event.tenant_id).trim(),
    session_id: String(event.session_id).trim(),
    user_id: String(event.user_id).trim(),
    timestamp: new Date(event.timestamp),
    deployment_type: String(event.deployment_type).trim(),
    channel: String(event.channel).trim(),
    l1_domain: String(event.l1_domain).trim(),
    l2_module: String(event.l2_module).trim(),
    l3_feature: String(event.l3_feature).trim(),
    l4_action: String(event.l4_action).trim(),
    l5_deployment_node: String(event.l5_deployment_node).trim(),
    duration_ms: event.duration_ms === undefined ? null : Number(event.duration_ms),
    success: event.success === undefined ? true : Boolean(event.success),
    metadata: event.metadata || {},
    feedback_text: event.feedback_text || '',
    churn_label: event.churn_label === undefined || event.churn_label === null ? null : Number(event.churn_label),
  };
}

module.exports = { validateEvent, normalizeEvent };
