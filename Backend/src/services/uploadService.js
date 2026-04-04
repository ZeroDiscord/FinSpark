'use strict';

const path = require('path');
const { extractFeatures } = require('../../services/apkParser');
const { crawlWebsite } = require('../../services/webCrawler');
const { parseCsvFile } = require('./csvParserService');
const { ingestCsvForMl } = require('./mlService');
const { createUpload, updateUploadStatus } = require('../models/UploadedFileModel');
const { upsertDetectedFeature } = require('../models/DetectedFeatureModel');
const { insertUsageEvents } = require('../models/UsageEventModel');
const UsageEventLog = require('../models/UsageEventLogModel');

async function saveFeatures(tenantId, uploadId, features) {
  for (const feature of features) {
    await upsertDetectedFeature(tenantId, uploadId, feature);
  }
}

async function processApkUpload({ tenant, file }) {
  const upload = await createUpload({
    tenantId: tenant.id,
    sourceType: 'apk',
    originalName: file.originalname,
    filePath: file.path,
  });

  const { features, raw_activity_names } = await extractFeatures(file.path);
  await saveFeatures(tenant.id, upload.id, features);
  await updateUploadStatus(upload.id, {
    status: 'complete',
    metadata: { raw_activity_names },
  });

  return { upload, features, raw_activity_names };
}

async function processWebsiteSubmission({ tenant, url, crawlDepth }) {
  const upload = await createUpload({
    tenantId: tenant.id,
    sourceType: 'url',
    originalName: url,
    metadata: { crawl_depth: crawlDepth },
  });

  const { features, page_title } = await crawlWebsite(url, crawlDepth);
  await saveFeatures(tenant.id, upload.id, features);
  await updateUploadStatus(upload.id, {
    status: 'complete',
    metadata: { crawl_depth: crawlDepth, page_title },
  });

  return { upload, features, page_title };
}

async function processCsvUpload({ tenant, file, deploymentType = 'cloud' }) {
  const upload = await createUpload({
    tenantId: tenant.id,
    sourceType: 'csv',
    originalName: file.originalname,
    filePath: file.path,
  });

  const parsed = await parseCsvFile(file.path);
  await insertUsageEvents(tenant.id, parsed.rows);

  if (UsageEventLog?.db?.readyState === 1) {
    await UsageEventLog.insertMany(parsed.rows, { ordered: false }).catch(() => null);
  }

  const mlResult = await ingestCsvForMl({
    file_path: path.resolve(file.path),
    tenant_id: tenant.tenant_hash,
    deployment_type: deploymentType,
  });

  await updateUploadStatus(upload.id, {
    status: 'complete',
    events_ingested: parsed.rowCount,
    schema_match_score: mlResult.schema_match_score ?? 1,
    warnings: mlResult.warnings || [],
    metadata: {
      preview: parsed.preview,
      ml_response: mlResult,
    },
  });

  return {
    upload,
    parsed,
    mlResult,
  };
}

module.exports = {
  processApkUpload,
  processWebsiteSubmission,
  processCsvUpload,
};
