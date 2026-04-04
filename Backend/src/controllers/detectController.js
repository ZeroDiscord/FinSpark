'use strict';

const { findTenantByIdForOwner } = require('../models/TenantModel');
const { processApkUpload, processWebsiteSubmission } = require('../services/uploadService');
const { getDetectionByUploadId } = require('../services/featureService');
const { ValidationError, NotFoundError } = require('../utils/errors');

async function resolveTenant(req) {
  const tenantId = req.body.tenant_db_id || req.body.tenant_id || req.user.tenant_db_id;
  const tenant = await findTenantByIdForOwner(tenantId, req.user.sub);
  if (!tenant) throw new NotFoundError('Tenant not found.');
  return tenant;
}

async function detectApk(req, res) {
  if (!req.file) throw new ValidationError('APK file is required.');
  const tenant = await resolveTenant(req);
  const result = await processApkUpload({ tenant, file: req.file });

  return res.json({
    upload_id: result.upload.id,
    source_type: 'apk',
    status: 'processed',
    summary: result.summary,
    features: result.features,
  });
}

async function detectUrl(req, res) {
  if (!req.body.url) throw new ValidationError('url is required.');
  const tenant = await resolveTenant(req);
  const result = await processWebsiteSubmission({
    tenant,
    url: req.body.url,
    crawlDepth: Number(req.body.max_depth || req.body.crawl_depth || 2),
  });

  return res.json({
    upload_id: result.upload.id,
    source_type: 'url',
    status: 'processed',
    page_title: result.page_title,
    summary: result.summary,
    features: result.features,
  });
}

async function getDetection(req, res) {
  const detection = await getDetectionByUploadId(req.params.uploadId, req.user.sub);
  return res.json(detection);
}

module.exports = { detectApk, detectUrl, getDetection };
