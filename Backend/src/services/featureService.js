'use strict';

const { findUploadById, findUploadByIdForOwner } = require('../models/UploadedFileModel');
const { listFeaturesByTenant, listFeaturesByUpload } = require('../models/DetectedFeatureModel');
const { findTenantByIdForOwner } = require('../models/TenantModel');
const { NotFoundError } = require('../utils/errors');

function buildHierarchy(features) {
  return features.map((feature) => ({
    id: feature.id,
    raw_name: feature.raw_identifier || feature.name,
    clean_name: feature.name,
    l1_domain: feature.l1_domain,
    l2_module: feature.l2_module,
    l3_feature: feature.l3_feature,
    name: feature.name,
    confidence: Number(feature.confidence || 0),
    source_type: feature.source_type,
  }));
}

async function getFeaturesByResourceId(resourceId, userId) {
  const upload = await findUploadById(resourceId);
  if (upload) {
    const features = await listFeaturesByUpload(upload.id);
    return {
      resource_type: 'upload',
      upload_id: upload.id,
      features: buildHierarchy(features),
    };
  }

  const tenant = await findTenantByIdForOwner(resourceId, userId);
  if (!tenant) throw new NotFoundError('Upload or tenant not found.');

  const features = await listFeaturesByTenant(tenant.id);
  return {
    resource_type: 'tenant',
    tenant_id: tenant.id,
    features: buildHierarchy(features),
  };
}

async function getDetectionByUploadId(uploadId, userId = null) {
  const upload = userId
    ? await findUploadByIdForOwner(uploadId, userId)
    : await findUploadById(uploadId);
  if (!upload) throw new NotFoundError('Upload not found.');

  const features = await listFeaturesByUpload(upload.id);
  return {
    upload_id: upload.id,
    status: upload.status,
    source_type: upload.source_type,
    summary: upload.metadata?.detection_summary || null,
    features: buildHierarchy(features),
  };
}

module.exports = { getFeaturesByResourceId, getDetectionByUploadId };
