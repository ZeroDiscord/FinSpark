'use strict';

const fs = require('fs');
const path = require('path');
const { parseCsvFile } = require('./csvParserService');
const { ingestCsvForMl } = require('./mlService');
const { createUpload, updateUploadStatus } = require('../models/UploadedFileModel');
const { upsertDetectedFeature } = require('../models/DetectedFeatureModel');
const { insertUsageEvents } = require('../models/UsageEventModel');
const UsageEventLog = require('../models/UsageEventLogModel');
const { detectFeaturesFromApk, detectFeaturesFromUrl } = require('./detect');
const { extractPathsFromLogFile } = require('./detect/logPathDiscoveryService');

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

function normalizePathForLogger(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, 'https://example.com');
    return url.pathname.replace(/\/$/, '') || '/';
  } catch {
    const pathOnly = trimmed.split('?')[0].split('#')[0].trim();
    if (!pathOnly) return null;
    if (!pathOnly.startsWith('/')) return `/${pathOnly}`;
    return pathOnly;
  }
}

function buildPathLoggerCode(paths, logDir) {
  return `// FinSpark Path Logger Middleware
// Drop this file into your Express app as middleware.
// It logs only requests matching the supplied path list.
// Install dependency: npm install rotating-file-stream

const fs = require('fs');
const path = require('path');
const rfs = require('rotating-file-stream');

const LOG_DIR = path.resolve('${logDir}');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const PATHS_TO_LOG = new Set(${JSON.stringify(paths, null, 2)});

const stream = rfs.createStream(
  (time, index) => {
    if (!time) return 'finspark-path-requests.log';
    const date = time.toISOString().slice(0, 10);
    return 'finspark-path-requests-' + date + '.' + index + '.log';
  },
  { interval: '1d', path: LOG_DIR, maxFiles: 30 }
);

module.exports = function finsparkPathLogger(req, res, next) {
  const requestPath = req.path || req.url.split('?')[0] || '/';
  const shouldLog = PATHS_TO_LOG.has(requestPath);
  const start = Date.now();

  if (shouldLog) {
    res.on('finish', () => {
      const entry = {
        ts: new Date().toISOString(),
        method: req.method,
        path: requestPath,
        query: req.query || {},
        status: res.statusCode || 0,
        duration_ms: Date.now() - start,
        user_agent: req.headers['user-agent'] || '',
        ip: req.ip || req.connection?.remoteAddress || '',
        session_id: req.headers['x-session-id'] || req.cookies?.session_id || '',
        user_id: req.user?.id || req.user?.sub || '',
      };
      stream.write(JSON.stringify(entry) + '\n');
    });
  }

  next();
};`;
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

async function processWebsiteSubmission({ tenant, url, crawlDepth, manualPaths, selectedPaths }) {
  const upload = await createUpload({
    tenantId: tenant.id,
    sourceType: 'url',
    originalName: url,
    metadata: { crawl_depth: crawlDepth, manual_paths: manualPaths, selected_paths: selectedPaths },
  });

  const detection = await detectFeaturesFromUrl(url, {
    max_depth: crawlDepth,
    manual_paths: manualPaths,     // user-typed known paths
    selected_paths: selectedPaths, // paths chosen from auto-crawl discovery
  });

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

  return {
    upload,
    features: detection.features,
    page_title: detection.page_title,
    extraction_mode: detection.extraction_mode,
    summary: detection.summary,
  };
}

async function processWebsiteLogUpload({ tenant, file }) {
  const upload = await createUpload({
    tenantId: tenant.id,
    sourceType: 'url_log',
    originalName: file.originalname,
    filePath: file.path,
  });

  const logResult = await extractPathsFromLogFile(file.path);
  const selectedPaths = logResult.path_stats.slice(0, 50).map((item) => item.path);
  const baseUrl = logResult.base_url || 'https://example.com';

  const detection = await detectFeaturesFromUrl(baseUrl, {
    max_depth: 0,
    selected_paths: selectedPaths,
  });

  const features = detection.features.map(toStoredFeature);
  await saveFeatures(tenant.id, upload.id, features);
  await updateUploadStatus(upload.id, {
    status: 'complete',
    metadata: {
      path_stats: logResult.path_stats,
      base_url: logResult.base_url,
      total_log_lines: logResult.total_lines,
      parsed_log_lines: logResult.parsed_lines,
      detection_summary: detection.summary,
    },
  });

  return {
    upload,
    features: detection.features,
    path_stats: logResult.path_stats,
    base_url: logResult.base_url,
    extraction_mode: 'log',
    summary: {
      paths_found: logResult.path_stats.length,
      parsed_lines: logResult.parsed_lines,
      base_url: logResult.base_url,
    },
  };
}

async function generatePathLoggerSnippet({ tenant, file, logDir = './logs' }) {
  if (!fs.existsSync(file.path)) {
    throw new Error('Uploaded file not found.');
  }

  const text = fs.readFileSync(file.path, 'utf8');
  const rawPaths = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const normalizedPaths = [...new Set(rawPaths.map(normalizePathForLogger).filter(Boolean))].sort();

  const upload = await createUpload({
    tenantId: tenant.id,
    sourceType: 'path_logger',
    originalName: file.originalname,
    filePath: file.path,
  });

  const code = buildPathLoggerCode(normalizedPaths, logDir);

  await updateUploadStatus(upload.id, {
    status: 'complete',
    metadata: {
      path_file: file.originalname,
      path_count: normalizedPaths.length,
      log_dir: logDir,
    },
  });

  return {
    upload,
    filename: 'finspark-path-logger.js',
    code,
    paths: normalizedPaths,
    log_dir: logDir,
  };
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

  await UsageEventLog.insertMany(parsed.rows, { ordered: false }).catch(() => null);

  let mlResult = { schema_match_score: 1, warnings: [] };
  try {
    mlResult = await ingestCsvForMl({
      file_path: path.resolve(file.path),
      tenant_id: tenant.tenant_hash,
      deployment_type: deploymentType,
    });
  } catch {
    // ML service unavailable — events are already saved to MongoDB, proceed
  }

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
  processWebsiteLogUpload,
  generatePathLoggerSnippet,
  processCsvUpload,
};
