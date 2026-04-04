'use strict';

const mongoose = require('mongoose');

const usageEventSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    session_id: { type: String, required: true, index: true },
    user_id: { type: String, index: true },
    timestamp: { type: Date, required: true, index: true },
    deployment_type: { type: String, enum: ['cloud', 'onprem'], index: true },
    channel: { type: String, index: true },
    l1_domain: { type: String, index: true },
    l2_module: { type: String, index: true },
    l3_feature: { type: String, required: true, index: true },
    l4_action: { type: String, index: true },
    l5_deployment_node: String,
    duration_ms: Number,
    success: Boolean,
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    feedback_text: String,
    churn_label: { type: Number, index: true },
    ingested_at: { type: Date, default: Date.now },
  },
  { collection: 'usage_events', timestamps: true }
);

usageEventSchema.index({ tenant_id: 1, timestamp: -1 });
usageEventSchema.index({ tenant_id: 1, session_id: 1, timestamp: 1 });
usageEventSchema.index({ tenant_id: 1, l3_feature: 1, timestamp: -1 });
usageEventSchema.index({ tenant_id: 1, churn_label: 1, timestamp: -1 });
usageEventSchema.index({ tenant_id: 1, channel: 1, deployment_type: 1, timestamp: -1 });

module.exports = mongoose.models.UsageEvent || mongoose.model('UsageEvent', usageEventSchema);
