'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/dashboardController');
const legacyDashboardRoutes = require('../../routes/dashboard.routes');

router.get('/', requireAuth, asyncHandler(controller.getDashboard));
router.get('/kpis', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getKpis));
router.get('/feature-usage', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getFeatureUsage));
router.get('/churn', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getChurn));
router.get('/funnel', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getFunnel));
router.get('/journeys', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getJourneys));
router.get('/time-insights', requireAuth, asyncHandler(controller.attachTenant), asyncHandler(controller.getTimeInsights));
router.get('/tenant-comparison', requireAuth, asyncHandler(controller.getTenantComparison));
router.use('/', legacyDashboardRoutes);

module.exports = router;
