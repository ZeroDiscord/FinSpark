'use strict';

const { findUploadById } = require('../models/UploadedFileModel');
const { listFeaturesByTenant, listFeaturesByUpload } = require('../models/DetectedFeatureModel');
const { findTenantByIdForOwner } = require('../models/TenantModel');
const { NotFoundError } = require('../utils/errors');

function buildHierarchy(features) {
  return features.map((feature) => ({
    id: feature.id,
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

module.exports = { getFeaturesByResourceId };
