'use strict';

const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    analysis_run_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AnalysisRun', index: true },
    feature_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DetectedFeature', index: true },
    title: { type: String, required: true },
    problem: { type: String, required: true },
    suggestion: { type: String, required: true },
    priority: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true, index: true },
    churn_score: Number,
    impact_score: Number,
    status: { type: String, enum: ['open', 'sent', 'dismissed', 'resolved'], default: 'open', index: true },
    source_data: { type: mongoose.Schema.Types.Mixed, default: {} },
    asana_task_gid: String,
    asana_task_url: String,
  },
  { collection: 'recommendations', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

recommendationSchema.index({ tenant_id: 1, status: 1, priority: 1, created_at: -1 });

module.exports =
  mongoose.models.Recommendation || mongoose.model('Recommendation', recommendationSchema);
