'use strict';

const DetectedFeature = require('../database/models/DetectedFeature');

function normalizeFeature(featureDoc) {
  if (!featureDoc) return null;
  return {
    id: String(featureDoc._id),
    tenant_id: featureDoc.tenant_id,
    upload_id: featureDoc.upload_id ? String(featureDoc.upload_id) : null,
    name: featureDoc.name,
    l3_feature: featureDoc.l3_feature,
    l2_module: featureDoc.l2_module,
    l1_domain: featureDoc.l1_domain,
    source_type: featureDoc.source_type,
    confidence: featureDoc.confidence,
    raw_identifier: featureDoc.raw_identifier || null,
    created_at: featureDoc.created_at || featureDoc.createdAt || null,
  };
}

async function upsertDetectedFeature(tenantId, uploadId, feature) {
  const doc = await DetectedFeature.findOneAndUpdate(
    { tenant_id: tenantId, l3_feature: feature.l3_feature },
    {
      $set: {
        upload_id: uploadId || null,
        name: feature.name,
        l2_module: feature.l2_module,
        l1_domain: feature.l1_domain,
        source_type: feature.source_type,
        raw_identifier: feature.raw_identifier || null,
      },
      $max: { confidence: Number(feature.confidence || 0) },
      $setOnInsert: { first_seen_at: new Date() },
    },
    { new: true, upsert: true }
  ).lean();

  return normalizeFeature(doc);
}

async function listFeaturesByTenant(tenantId) {
  const docs = await DetectedFeature.find({ tenant_id: tenantId })
    .sort({ confidence: -1, created_at: -1 })
    .lean();
  return docs.map(normalizeFeature);
}

async function listFeaturesByUpload(uploadId) {
  const docs = await DetectedFeature.find({ upload_id: uploadId })
    .sort({ confidence: -1, created_at: -1 })
    .lean();
  return docs.map(normalizeFeature);
}

module.exports = { upsertDetectedFeature, listFeaturesByTenant, listFeaturesByUpload };
