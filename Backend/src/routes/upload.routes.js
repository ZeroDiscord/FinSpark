'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { uploadApkSingle, uploadCsvSingle } = require('../middleware/upload');
const controller = require('../controllers/uploadController');

router.post('/apk', requireAuth, uploadApkSingle, asyncHandler(controller.uploadApk));
router.post('/csv', requireAuth, uploadCsvSingle, asyncHandler(controller.uploadCsv));
router.post('/url', requireAuth, asyncHandler(controller.submitWebsiteUrl));

module.exports = router;
