'use strict';

const { query } = require('../../db/client');

async function upsertDetectedFeature(tenantId, uploadId, feature) {
  const result = await query(
    `INSERT INTO features (tenant_id, upload_id, name, l3_feature, l2_module, l1_domain, source_type, confidence, raw_identifier)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tenant_id, l3_feature)
     DO UPDATE SET
       upload_id = EXCLUDED.upload_id,
       name = EXCLUDED.name,
       l2_module = EXCLUDED.l2_module,
       l1_domain = EXCLUDED.l1_domain,
       source_type = EXCLUDED.source_type,
       confidence = GREATEST(features.confidence, EXCLUDED.confidence),
       raw_identifier = EXCLUDED.raw_identifier
     RETURNING *`,
    [
      tenantId,
      uploadId,
      feature.name,
      feature.l3_feature,
      feature.l2_module,
      feature.l1_domain,
      feature.source_type,
      feature.confidence,
      feature.raw_identifier || null,
    ]
  );
  return result.rows[0];
}

async function listFeaturesByTenant(tenantId) {
  const result = await query(
    `SELECT * FROM features WHERE tenant_id = $1 ORDER BY confidence DESC, created_at DESC`,
    [tenantId]
  );
  return result.rows;
}

async function listFeaturesByUpload(uploadId) {
  const result = await query(
    `SELECT * FROM features WHERE upload_id = $1 ORDER BY confidence DESC, created_at DESC`,
    [uploadId]
  );
  return result.rows;
}

module.exports = { upsertDetectedFeature, listFeaturesByTenant, listFeaturesByUpload };
