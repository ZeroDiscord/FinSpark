'use strict';

const { findTenantByIdForOwner, findTenantByHashForOwner } = require('../models/TenantModel');
const { processApkUpload, processCsvUpload, processWebsiteSubmission, processWebsiteLogUpload, generatePathLoggerSnippet } = require('../services/uploadService');
const { discoverPaths } = require('../services/detect/pathDiscoveryService');
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
  const { url, crawl_depth = 1, manual_paths, selected_paths } = req.body;
  if (!url) throw new ValidationError('url is required.');
  const tenant = await resolveTenant(req);
  const result = await processWebsiteSubmission({
    tenant,
    url,
    crawlDepth: Number(crawl_depth),
    manualPaths: manual_paths || null,
    selectedPaths: selected_paths || null,
  });

  return res.json({
    upload_id: result.upload.id,
    page_title: result.page_title,
    extraction_mode: result.extraction_mode,
    summary: result.summary,
    features: result.features,
  });
}

async function discoverWebsitePaths(req, res) {
  const { url, max_pages = 50, max_depth = 3 } = req.body;
  if (!url) throw new ValidationError('url is required.');
  if (!/^https?:\/\/.+/i.test(url)) throw new ValidationError('url must start with http:// or https://');

  const result = await discoverPaths(url, {
    maxPages: Math.min(Number(max_pages), 100),
    maxDepth: Math.min(Number(max_depth), 4),
  });
  return res.json(result);
}

async function submitWebsiteLog(req, res) {
  if (!req.file) throw new ValidationError('Log file is required.');
  const tenant = await resolveTenant(req);
  const result = await processWebsiteLogUpload({ tenant, file: req.file });

  return res.json({
    upload_id: result.upload.id,
    path_stats: result.path_stats,
    base_url: result.base_url,
    extraction_mode: result.extraction_mode,
    features: result.features,
    summary: result.summary,
  });
}

async function submitPathLoggerSnippet(req, res) {
  if (!req.file) throw new ValidationError('Path file is required.');
  const tenant = await resolveTenant(req);
  const logDir = req.body.log_dir || './logs';
  const result = await generatePathLoggerSnippet({ tenant, file: req.file, logDir });

  return res.json({
    upload_id: result.upload.id,
    filename: result.filename,
    code: result.code,
    paths: result.paths,
    log_dir: result.log_dir,
  });
}

async function getLoggerSnippet(req, res) {
  const { framework = 'express', log_dir = './logs' } = req.query;

  const snippets = {
    express: `// FinSpark Request Logger Middleware
// Drop this file into your Express app as middleware.
// It logs every request to a daily rotating log file that FinSpark can ingest.
//
// Install dependency:  npm install rotating-file-stream
// Then add to your app.js BEFORE your routes:
//   const finsparkLogger = require('./finspark-logger');
//   app.use(finsparkLogger);

const rfs = require('rotating-file-stream');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.resolve('${log_dir}');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const stream = rfs.createStream(
  (time, index) => {
    if (!time) return 'finspark-requests.log';
    const date = time.toISOString().slice(0, 10);
    return \`finspark-requests-\${date}.\${index}.log\`;
  },
  { interval: '1d', path: LOG_DIR, maxFiles: 30 }
);

module.exports = function finsparkLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const entry = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      query: req.query,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      user_agent: req.headers['user-agent'] || '',
      ip: req.ip || req.connection?.remoteAddress || '',
      session_id: req.headers['x-session-id'] || req.cookies?.session_id || '',
      user_id: req.user?.id || req.user?.sub || '',
    };
    stream.write(JSON.stringify(entry) + '\\n');
  });
  next();
};`,

    flask: `# FinSpark Request Logger Middleware for Flask
# Drop this into your Flask app.
# It logs every request to a daily rotating JSONL file FinSpark can ingest.
#
# Usage — add to your app factory or main app.py:
#   from finspark_logger import register_logger
#   register_logger(app)

import json
import time
import os
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
import logging

LOG_DIR = os.path.abspath('${log_dir}')
os.makedirs(LOG_DIR, exist_ok=True)

_handler = TimedRotatingFileHandler(
    os.path.join(LOG_DIR, 'finspark-requests.log'),
    when='midnight', backupCount=30, encoding='utf-8'
)
_logger = logging.getLogger('finspark')
_logger.setLevel(logging.INFO)
_logger.addHandler(_handler)
_logger.propagate = False


def register_logger(app):
    @app.before_request
    def _start():
        from flask import g, request
        g._finspark_start = time.time()

    @app.after_request
    def _log(response):
        from flask import g, request, session
        duration_ms = round((time.time() - getattr(g, '_finspark_start', time.time())) * 1000)
        entry = {
            'ts': datetime.utcnow().isoformat() + 'Z',
            'method': request.method,
            'path': request.path,
            'query': dict(request.args),
            'status': response.status_code,
            'duration_ms': duration_ms,
            'user_agent': request.headers.get('User-Agent', ''),
            'ip': request.remote_addr or '',
            'session_id': session.get('id', ''),
            'user_id': session.get('user_id', ''),
        }
        _logger.info(json.dumps(entry))
        return response`,

    fastapi: `# FinSpark Request Logger Middleware for FastAPI
# Drop this into your FastAPI app.
# Logs every request to a daily rotating JSONL file FinSpark can ingest.
#
# Usage — add to your main.py:
#   from finspark_logger import FinSparkLoggerMiddleware
#   app.add_middleware(FinSparkLoggerMiddleware)

import json
import time
import os
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

LOG_DIR = os.path.abspath('${log_dir}')
os.makedirs(LOG_DIR, exist_ok=True)

_handler = TimedRotatingFileHandler(
    os.path.join(LOG_DIR, 'finspark-requests.log'),
    when='midnight', backupCount=30, encoding='utf-8'
)
_logger = logging.getLogger('finspark')
_logger.setLevel(logging.INFO)
_logger.addHandler(_handler)
_logger.propagate = False


class FinSparkLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000)
        entry = {
            'ts': datetime.utcnow().isoformat() + 'Z',
            'method': request.method,
            'path': request.url.path,
            'query': dict(request.query_params),
            'status': response.status_code,
            'duration_ms': duration_ms,
            'user_agent': request.headers.get('user-agent', ''),
            'ip': request.client.host if request.client else '',
            'session_id': request.cookies.get('session_id', ''),
            'user_id': '',
        }
        _logger.info(json.dumps(entry))
        return response`,
  };

  const code = snippets[framework] || snippets.express;
  const filename = framework === 'express' ? 'finspark-logger.js' : 'finspark_logger.py';

  return res.json({ framework, filename, code, log_dir });
}

module.exports = { uploadApk, uploadCsv, submitWebsiteUrl, submitWebsiteLog, submitPathLoggerSnippet, discoverWebsitePaths, getLoggerSnippet };
