'use strict';

const { getFeaturesByResourceId } = require('../services/featureService');

async function getFeatures(req, res) {
  const payload = await getFeaturesByResourceId(req.params.resourceId, req.user.sub);
  return res.json({
    features: payload.features,
    total: payload.features.length,
    resource_type: payload.resource_type,
    upload_id: payload.upload_id || null,
    tenant_id: payload.tenant_id || null,
  });
}

module.exports = { getFeatures };
