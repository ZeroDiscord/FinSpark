'use strict';

const { ValidationError } = require('../../utils/errors');

// Only truly required — everything else gets a sensible default in normalizeEvent
const REQUIRED_FIELDS = ['tenant_id', 'session_id'];

function validateEvent(event) {
  const missing = REQUIRED_FIELDS.filter((field) => !event[field] && event[field] !== false && event[field] !== 0);
  if (missing.length) {
    throw new ValidationError(`Missing required event fields: ${missing.join(', ')}`);
  }

  if (!event.tenant_id || !String(event.tenant_id).trim()) {
    throw new ValidationError('tenant_id is required.');
  }

  if (event.duration_ms !== undefined && Number.isNaN(Number(event.duration_ms))) {
    throw new ValidationError('duration_ms must be numeric.');
  }

  if (event.timestamp !== undefined) {
    const parsedDate = new Date(event.timestamp);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new ValidationError('timestamp must be a valid ISO datetime.');
    }
  }
}

function normalizeEvent(event) {
  validateEvent(event);
  return {
    tenant_id: String(event.tenant_id).trim(),
    session_id: String(event.session_id).trim(),
    user_id: event.user_id ? String(event.user_id).trim() : 'anonymous',
    timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
    deployment_type: event.deployment_type ? String(event.deployment_type).trim() : 'cloud',
    channel: event.channel ? String(event.channel).trim() : 'web',
    l1_domain: event.l1_domain ? String(event.l1_domain).trim() : 'general',
    l2_module: event.l2_module ? String(event.l2_module).trim() : 'general',
    l3_feature: event.l3_feature ? String(event.l3_feature).trim() : 'unknown',
    l4_action: event.l4_action ? String(event.l4_action).trim() : 'interact',
    l5_deployment_node: event.l5_deployment_node ? String(event.l5_deployment_node).trim() : 'default',
    duration_ms: event.duration_ms === undefined ? null : Number(event.duration_ms),
    success: event.success === undefined ? true : Boolean(event.success),
    metadata: event.metadata || {},
    feedback_text: event.feedback_text || '',
    churn_label: event.churn_label === undefined || event.churn_label === null ? null : Number(event.churn_label),
  };
}

module.exports = { validateEvent, normalizeEvent };
