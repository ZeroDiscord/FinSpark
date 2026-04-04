'use strict';

const mongoose = require('mongoose');

const processedSessionSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    session_id: { type: String, required: true },
    user_id: { type: String, index: true },
    session_start: Date,
    session_end: Date,
    feature_sequence: { type: [String], default: [] },
    action_sequence: { type: [String], default: [] },
    avg_duration_ms: Number,
    total_duration_ms: Number,
    failure_count: { type: Number, default: 0 },
    success_count: { type: Number, default: 0 },
    drop_off_feature: { type: String, index: true },
    churn_label: { type: Number, index: true },
    source_event_count: Number,
  },
  { collection: 'processed_sessions', timestamps: true }
);

processedSessionSchema.index({ tenant_id: 1, session_id: 1 }, { unique: true });
processedSessionSchema.index({ tenant_id: 1, drop_off_feature: 1 });

module.exports =
  mongoose.models.ProcessedSession || mongoose.model('ProcessedSession', processedSessionSchema);
