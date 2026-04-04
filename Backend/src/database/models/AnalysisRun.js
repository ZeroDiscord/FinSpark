'use strict';

const mongoose = require('mongoose');

const analysisRunSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    upload_id: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadedFile', index: true },
    run_type: {
      type: String,
      enum: ['feature_detection', 'csv_ingest', 'ml_prediction', 'recommendation_refresh', 'dashboard_refresh'],
      required: true,
      index: true,
    },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued', index: true },
    input_summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    output_summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    started_at: Date,
    finished_at: Date,
  },
  { collection: 'analysis_runs', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

analysisRunSchema.index({ tenant_id: 1, run_type: 1, created_at: -1 });

module.exports = mongoose.models.AnalysisRun || mongoose.model('AnalysisRun', analysisRunSchema);
