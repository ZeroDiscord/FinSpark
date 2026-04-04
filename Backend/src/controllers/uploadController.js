'use strict';

const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');
const { processApkUpload, processCsvUpload, processWebsiteSubmission } = require('../services/uploadService');
const { ValidationError, NotFoundError } = require('../utils/errors');

async function resolveTenant(req) {
  const tenantId = req.body.tenant_db_id || req.user.tenant_db_id;
  const tenant =
    (await findTenantByIdForOwner(tenantId, req.user.sub)) ||
    (await findTenantByHashForOwner(tenantId, req.user.sub));
  if (!tenant) throw new NotFoundError('Tenant not found.');
  return tenant;
}

async function uploadApk(req, res) {
  if (!req.file) throw new ValidationError('APK file is required.');
  const tenant = await resolveTenant(req);
  const result = await processApkUpload({ tenant, file: req.file });
  return res.json({
    upload_id: result.upload.id,
    status: 'uploaded',
    features: result.features,
    raw_activity_names: result.raw_activity_names,
  });
}

async function uploadCsv(req, res) {
  if (!req.file) throw new ValidationError('CSV file is required.');
  const tenant = await resolveTenant(req);
  const result = await processCsvUpload({
    tenant,
    file: req.file,
    deploymentType: req.body.deployment_type || 'cloud',
  });

  return res.json({
    upload_id: result.upload.id,
    events_ingested: result.parsed.rowCount,
    preview_rows: result.parsed.preview,
    schema_match_score: result.mlResult.schema_match_score ?? 1,
    warnings: result.mlResult.warnings || [],
  });
}

async function submitWebsiteUrl(req, res) {
  const { url, crawl_depth = 1 } = req.body;
  if (!url) throw new ValidationError('url is required.');
  const tenant = await resolveTenant(req);
  const result = await processWebsiteSubmission({ tenant, url, crawlDepth: Number(crawl_depth) });

  return res.json({
    upload_id: result.upload.id,
    page_title: result.page_title,
    features: result.features,
  });
}

module.exports = { uploadApk, uploadCsv, submitWebsiteUrl };
