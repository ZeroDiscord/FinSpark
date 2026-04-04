'use strict';

const { query } = require('../../db/client');

async function createUpload({ tenantId, sourceType, originalName, filePath = null, metadata = {} }) {
  const result = await query(
    `INSERT INTO uploads (tenant_id, source_type, original_name, file_path, status, metadata)
     VALUES ($1, $2, $3, $4, 'processing', $5)
     RETURNING *`,
    [tenantId, sourceType, originalName, filePath, JSON.stringify(metadata)]
  );
  return result.rows[0];
}

async function updateUploadStatus(id, updates) {
  const result = await query(
    `UPDATE uploads
     SET status = COALESCE($2, status),
         events_ingested = COALESCE($3, events_ingested),
         schema_match_score = COALESCE($4, schema_match_score),
         warnings = COALESCE($5, warnings),
         metadata = COALESCE($6, metadata)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      updates.status || null,
      updates.events_ingested ?? null,
      updates.schema_match_score ?? null,
      updates.warnings ? JSON.stringify(updates.warnings) : null,
      updates.metadata ? JSON.stringify(updates.metadata) : null,
    ]
  );
  return result.rows[0];
}

async function findUploadById(id) {
  const result = await query(`SELECT * FROM uploads WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}

module.exports = { createUpload, updateUploadStatus, findUploadById };
