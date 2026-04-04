'use strict';

const path = require('path');
const { parseCsvFile } = require('./csvParserService');
const { ingestCsvForMl } = require('./mlService');
const { createUpload, updateUploadStatus } = require('../models/UploadedFileModel');
const { upsertDetectedFeature } = require('../models/DetectedFeatureModel');
const { insertUsageEvents } = require('../models/UsageEventModel');
const UsageEventLog = require('../models/UsageEventLogModel');
const { detectFeaturesFromApk, detectFeaturesFromUrl } = require('./detect');

async function saveFeatures(tenantId, uploadId, features) {
  for (const feature of features) {
    await upsertDetectedFeature(tenantId, uploadId, feature);
  }
}

function toStoredFeature(feature) {
  return {
    name: feature.clean_name || feature.name,
    l3_feature: feature.l3_feature || feature.clean_name,
    l2_module: feature.l2_module,
    l1_domain: feature.l1_domain,
    source_type: feature.source_type,
    confidence: feature.confidence,
    raw_identifier: feature.raw_name || feature.raw_identifier || null,
  };
}

async function processApkUpload({ tenant, file }) {
  const upload = await createUpload({
    tenantId: tenant.id,
    sourceType: 'apk',
    originalName: file.originalname,
    filePath: file.path,
  });

  const detection = await detectFeaturesFromApk(file.path, upload.id);
  const features = detection.features.map(toStoredFeature);
  const raw_activity_names = detection.features.map((feature) => feature.raw_name).filter(Boolean);
  await saveFeatures(tenant.id, upload.id, features);
  await updateUploadStatus(upload.id, {
    status: 'complete',
    metadata: { raw_activity_names, detection_summary: detection.summary },
  });

  return { upload, features: detection.features, raw_activity_names, summary: detection.summary };
}

async function processWebsiteSubmission({ tenant, url, crawlDepth }) {
  const upload = await createUpload({
    tenantId: tenant.id,
    sourceType: 'url',
    originalName: url,
    metadata: { crawl_depth: crawlDepth },
  });

  const detection = await detectFeaturesFromUrl(url, { max_depth: crawlDepth });
  const features = detection.features.map(toStoredFeature);
  await saveFeatures(tenant.id, upload.id, features);
  await updateUploadStatus(upload.id, {
    status: 'complete',
    metadata: {
      crawl_depth: crawlDepth,
      page_title: detection.page_title,
      detection_summary: detection.summary,
    },
  });

  return { upload, features: detection.features, page_title: detection.page_title, summary: detection.summary };
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
