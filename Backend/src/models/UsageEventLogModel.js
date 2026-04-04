'use strict';

const mongoose = require('mongoose');

const usageEventLogSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    session_id: { type: String, required: true, index: true },
    user_id: { type: String },
    timestamp: { type: Date, required: true, index: true },
    deployment_type: String,
    channel: String,
    l1_domain: String,
    l2_module: String,
    l3_feature: { type: String, required: true, index: true },
    l4_action: String,
    l5_deployment_node: String,
    duration_ms: Number,
    success: Boolean,
    metadata: mongoose.Schema.Types.Mixed,
    feedback_text: String,
    churn_label: Number,
  },
  { collection: 'usage_event_logs', timestamps: true }
);

module.exports =
  mongoose.models.UsageEventLog ||
  mongoose.model('UsageEventLog', usageEventLogSchema);
