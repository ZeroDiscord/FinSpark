'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/dashboardController');
const legacyDashboardRoutes = require('../../routes/dashboard.routes');

router.get('/', requireAuth, asyncHandler(controller.getDashboard));
router.use('/', legacyDashboardRoutes);

module.exports = router;
