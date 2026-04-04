'use strict';

const mongoose = require('mongoose');

const featureHierarchySchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    feature_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DetectedFeature', required: true, index: true },
    parent_feature_id: { type: mongoose.Schema.Types.ObjectId, ref: 'FeatureHierarchy', default: null, index: true },
    level_no: { type: Number, min: 1, max: 5, required: true },
    node_name: { type: String, required: true },
    node_key: { type: String, required: true },
    path: { type: String, required: true },
    sort_order: { type: Number, default: 0 },
  },
  { collection: 'feature_hierarchy', timestamps: true }
);

featureHierarchySchema.index({ tenant_id: 1, path: 1 });
featureHierarchySchema.index({ tenant_id: 1, parent_feature_id: 1, sort_order: 1 });

module.exports =
  mongoose.models.FeatureHierarchy || mongoose.model('FeatureHierarchy', featureHierarchySchema);
