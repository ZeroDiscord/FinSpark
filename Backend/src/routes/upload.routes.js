'use strict';

const multer = require('multer');
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { uploadApkSingle, uploadCsvSingle, uploadLogSingle } = require('../middleware/upload');
const controller = require('../controllers/uploadController');

// Wrap multer middleware so its errors are forwarded as proper 400s
function withUpload(upload) {
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      // fileFilter rejection (InvalidFileError)
      return res.status(400).json({ error: err.message || 'File rejected.' });
    });
  };
}

router.post('/apk', requireAuth, withUpload(uploadApkSingle), asyncHandler(controller.uploadApk));
router.post('/csv', requireAuth, withUpload(uploadCsvSingle), asyncHandler(controller.uploadCsv));
router.post('/log', requireAuth, withUpload(uploadLogSingle), asyncHandler(controller.submitWebsiteLog));
router.post('/path-logger', requireAuth, withUpload(uploadLogSingle), asyncHandler(controller.submitPathLoggerSnippet));
router.post('/url', requireAuth, asyncHandler(controller.submitWebsiteUrl));
router.post('/discover-paths', requireAuth, asyncHandler(controller.discoverWebsitePaths));
router.get('/logger-snippet', requireAuth, asyncHandler(controller.getLoggerSnippet));

module.exports = router;
