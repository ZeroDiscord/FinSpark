'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/trackingController');
const legacyTrackingRoutes = require('../../routes/tracking.routes');

router.post('/generate', requireAuth, asyncHandler(controller.generateTracking));
router.use('/', legacyTrackingRoutes);

module.exports = router;
