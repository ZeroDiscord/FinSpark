'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { uploadApkSingle } = require('../middleware/upload');
const controller = require('../controllers/detectController');

router.post('/apk', requireAuth, uploadApkSingle, asyncHandler(controller.detectApk));
router.post('/url', requireAuth, asyncHandler(controller.detectUrl));
router.get('/:uploadId', requireAuth, asyncHandler(controller.getDetection));

module.exports = router;
