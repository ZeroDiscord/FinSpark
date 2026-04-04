'use strict';

const router = require('express').Router();
const path = require('path');
const requireAuth = require('../middleware/auth');
const { uploadApk, uploadCsv } = require('../middleware/upload');
const { query } = require('../db/client');
const { extractFeatures } = require('../services/apkParser');
const { crawlWebsite } = require('../services/webCrawler');
const mlClient = require('../services/mlClient');
const logger = require('../utils/logger');

async function upsertFeatures(tenantDbId, uploadId, features) {
  for (const f of features) {
    await query(
      `INSERT INTO features (tenant_id, upload_id, name, l3_feature, l2_module, l1_domain, source_type, confidence, raw_identifier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, l3_feature) DO UPDATE SET
         name = EXCLUDED.name, l2_module = EXCLUDED.l2_module,
         confidence = GREATEST(features.confidence, EXCLUDED.confidence)`,
      [tenantDbId, uploadId, f.name, f.l3_feature, f.l2_module, f.l1_domain, f.source_type, f.confidence, f.raw_identifier]
    );
  }
}

// POST /api/upload/apk
router.post('/apk', requireAuth, (req, res, next) => {
  uploadApk(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No APK file provided.' });

    try {
      const tenantDbId = req.user.tenant_db_id;
      const uploadRes = await query(
        `INSERT INTO uploads (tenant_id, source_type, original_name, file_path, status)
         VALUES ($1, 'apk', $2, $3, 'processing') RETURNING id`,
        [tenantDbId, req.file.originalname, req.file.path]
      );
      const uploadId = uploadRes.rows[0].id;

      const { features, raw_activity_names } = await extractFeatures(req.file.path);
      await upsertFeatures(tenantDbId, uploadId, features);

      await query(
        `UPDATE uploads SET status = 'complete', metadata = $2 WHERE id = $1`,
        [uploadId, JSON.stringify({ raw_count: raw_activity_names.length })]
      );

      res.json({
        upload_id: uploadId,
        features,
        raw_activity_names,
        status: 'detected',
      });
    } catch (e) {
      next(e);
    }
  });
});

// POST /api/upload/url
router.post('/url', requireAuth, async (req, res, next) => {
  try {
    const { url, crawl_depth = 0 } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required.' });

    new URL(url); // validate URL format

    const tenantDbId = req.user.tenant_db_id;
    const uploadRes = await query(
      `INSERT INTO uploads (tenant_id, source_type, original_name, status, metadata)
       VALUES ($1, 'url', $2, 'processing', $3) RETURNING id`,
      [tenantDbId, url, JSON.stringify({ crawl_depth })]
    );
    const uploadId = uploadRes.rows[0].id;

    const { features, page_title } = await crawlWebsite(url, crawl_depth);
    await upsertFeatures(tenantDbId, uploadId, features);

    await query(
      `UPDATE uploads SET status = 'complete', metadata = $2 WHERE id = $1`,
      [uploadId, JSON.stringify({ crawl_depth, page_title })]
    );

    res.json({ upload_id: uploadId, features, page_title, status: 'crawled' });
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('Invalid URL')) {
      return res.status(400).json({ error: 'Invalid URL format.' });
    }
    next(err);
  }
});

// POST /api/upload/csv
router.post('/csv', requireAuth, (req, res, next) => {
  uploadCsv(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No CSV file provided.' });

    try {
      const tenantDbId = req.user.tenant_db_id;
      const tenantHash = req.user.tenant_id;

      const uploadRes = await query(
        `INSERT INTO uploads (tenant_id, source_type, original_name, file_path, status)
         VALUES ($1, 'csv', $2, $3, 'processing') RETURNING id`,
        [tenantDbId, req.file.originalname, req.file.path]
      );
      const uploadId = uploadRes.rows[0].id;

      // Call ML /ingest with absolute file path
      const absolutePath = path.resolve(req.file.path);
      const mlRes = await mlClient.post('/ingest', {
        file_path: absolutePath,
        deployment_type: req.body.deployment_type || 'cloud',
        tenant_id: tenantHash,
      });

      const { events_ingested, schema_match_score, warnings } = mlRes.data;

      await query(
        `UPDATE uploads SET status = 'complete', events_ingested = $2,
         schema_match_score = $3, warnings = $4 WHERE id = $1`,
        [uploadId, events_ingested, schema_match_score, JSON.stringify(warnings)]
      );

      res.json({
        upload_id: uploadId,
        events_ingested,
        schema_match_score,
        warnings,
        status: 'ingested',
      });
    } catch (e) {
      next(e);
    }
  });
});

module.exports = router;
