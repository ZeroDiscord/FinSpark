'use strict';

const mongoose = require('mongoose');

const detectedFeatureSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    upload_id: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadedFile', index: true },
    external_feature_key: String,
    name: { type: String, required: true },
    l1_domain: { type: String, index: true },
    l2_module: { type: String, index: true },
    l3_feature: { type: String, required: true, index: true },
    source_type: { type: String, enum: ['apk', 'url', 'csv'], required: true },
    confidence: { type: Number, default: 0.5 },
    raw_identifier: String,
    first_seen_at: { type: Date, default: Date.now },
  },
  { collection: 'detected_features', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

detectedFeatureSchema.index({ tenant_id: 1, l3_feature: 1 }, { unique: true });
detectedFeatureSchema.index({ tenant_id: 1, l1_domain: 1, l2_module: 1 });

module.exports =
  mongoose.models.DetectedFeature || mongoose.model('DetectedFeature', detectedFeatureSchema);
