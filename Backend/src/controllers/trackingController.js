'use strict';

const { ok } = require('../utils/apiResponse');
const { generateTrackingSnippets } = require('../services/trackingService');
const { ValidationError } = require('../utils/errors');

async function generateTracking(req, res) {
  const { platform = 'web', features = [] } = req.body;
  if (!Array.isArray(features)) throw new ValidationError('features must be an array.');

  return ok(
    res,
    generateTrackingSnippets({
      platform,
      features,
      tenantId: req.user.tenant_id,
    })
  );
}

module.exports = { generateTracking };
