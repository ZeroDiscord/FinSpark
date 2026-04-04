'use strict';

const UploadedFile = require('../database/models/UploadedFile');
const User = require('../database/models/User');

function normalizeUpload(uploadDoc) {
  if (!uploadDoc) return null;
  return {
    id: String(uploadDoc._id),
    tenant_id: uploadDoc.tenant_id,
    source_type: uploadDoc.source_type,
    original_name: uploadDoc.original_name,
    file_path: uploadDoc.storage_path || null,
    status: uploadDoc.status,
    metadata: uploadDoc.metadata || {},
    events_ingested: uploadDoc.events_ingested ?? null,
    schema_match_score: uploadDoc.schema_match_score ?? null,
    warnings: uploadDoc.warnings || [],
    created_at: uploadDoc.created_at || uploadDoc.createdAt || null,
    updated_at: uploadDoc.updated_at || uploadDoc.updatedAt || null,
  };
}

async function createUpload({ tenantId, sourceType, originalName, filePath = null, metadata = {} }) {
  const upload = await UploadedFile.create({
    tenant_id: tenantId,
    source_type: sourceType,
    original_name: originalName,
    storage_path: filePath,
    metadata,
    status: 'processing',
  });
  return normalizeUpload(upload.toObject());
}

async function updateUploadStatus(id, updates) {
  const upload = await UploadedFile.findByIdAndUpdate(
    id,
    {
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.events_ingested !== undefined ? { events_ingested: updates.events_ingested } : {}),
      ...(updates.schema_match_score !== undefined ? { schema_match_score: updates.schema_match_score } : {}),
      ...(updates.warnings ? { warnings: updates.warnings } : {}),
      ...(updates.metadata ? { metadata: updates.metadata } : {}),
      ...(updates.status === 'complete' ? { completed_at: new Date() } : {}),
    },
    { new: true }
  ).lean();
  return normalizeUpload(upload);
}

async function findUploadById(id) {
  const upload = await UploadedFile.findById(id).lean();
  return normalizeUpload(upload);
}

async function findUploadByIdForOwner(id, ownerId) {
  const user = await User.findById(ownerId).lean();
  if (!user?.tenant_id) return null;
  const upload = await UploadedFile.findOne({ _id: id, tenant_id: user.tenant_id }).lean();
  return normalizeUpload(upload);
}

module.exports = { createUpload, updateUploadStatus, findUploadById, findUploadByIdForOwner };
