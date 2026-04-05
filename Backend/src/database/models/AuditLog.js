'use strict';

const mongoose = require('mongoose');

/**
 * AuditLog — immutable record of configuration and access changes.
 * Written to on: consent updates, role changes, tenant status changes,
 * export operations, and telemetry config modifications.
 */
const auditLogSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    actor_id:  { type: String, required: true, index: true },
    action:    {
      type: String,
      required: true,
      enum: [
        'consent_updated',
        'role_changed',
        'tenant_status_changed',
        'export_performed',
        'telemetry_config_changed',
        'model_retrained',
        'recommendation_dismissed',
        'recommendation_sent_to_asana',
      ],
      index: true,
    },
    resource:  { type: String, default: null },
    before:    { type: mongoose.Schema.Types.Mixed, default: null },
    after:     { type: mongoose.Schema.Types.Mixed, default: null },
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
  },
  {
    collection: 'audit_logs',
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

// Audit logs are write-once — disable updates
auditLogSchema.set('strict', true);
auditLogSchema.index({ tenant_id: 1, created_at: -1 });
auditLogSchema.index({ actor_id: 1, created_at: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
