'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/featureController');
const legacyFeatureRoutes = require('../../routes/features.routes');

router.get('/:resourceId', requireAuth, asyncHandler(controller.getFeatures));
router.use('/', legacyFeatureRoutes);

module.exports = router;
