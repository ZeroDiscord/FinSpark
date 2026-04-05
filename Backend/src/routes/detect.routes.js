'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { uploadApkSingle } = require('../middleware/upload');
const controller = require('../controllers/detectController');
const { processCrawlerOutput } = require('../services/detect/featureMatcher');

router.post('/apk', requireAuth, uploadApkSingle, asyncHandler(controller.detectApk));
router.post('/url', requireAuth, asyncHandler(controller.detectUrl));
router.get('/:uploadId', requireAuth, asyncHandler(controller.getDetection));

// POST /api/detect/match — map raw crawler feature list to canonical hierarchy
// Body: { features: string[], threshold?: number }
router.post('/match', requireAuth, asyncHandler(async (req, res) => {
  const { features, threshold = 0.3 } = req.body;
  if (!Array.isArray(features) || features.length === 0) {
    return res.status(400).json({ error: 'features must be a non-empty array of strings.' });
  }
  const result = processCrawlerOutput(features.map(String), Number(threshold));
  return res.json({ success: true, data: result });
}));

module.exports = router;
