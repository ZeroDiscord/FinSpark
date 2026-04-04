'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/exportController');
const legacyExportRoutes = require('../../routes/export.routes');

router.get('/powerbi', requireAuth, asyncHandler(controller.exportPowerBi));
router.post('/powerbi/push', requireAuth, asyncHandler(controller.pushPowerBi));
router.use('/', legacyExportRoutes);

module.exports = router;
