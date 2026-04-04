'use strict';

const mongoose = require('mongoose');

const mlPredictionSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    session_id: { type: String, required: true, index: true },
    processed_session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcessedSession', index: true },
    analysis_run_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AnalysisRun', index: true },
    model_name: { type: String, required: true },
    model_version: { type: String, required: true },
    churn_probability: { type: Number, required: true, index: true },
    drop_off_feature: { type: String, index: true },
    inference_ms: Number,
    request_payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    response_payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { collection: 'ml_predictions', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

mlPredictionSchema.index({ tenant_id: 1, session_id: 1, created_at: -1 });

module.exports = mongoose.models.MlPrediction || mongoose.model('MlPrediction', mlPredictionSchema);
