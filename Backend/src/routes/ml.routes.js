'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const controller = require('../controllers/mlController');

// Read-only — any authenticated user
router.get('/predictions', requireAuth, asyncHandler(controller.listPredictions));
router.get('/predictions/:sessionId', requireAuth, asyncHandler(controller.getPrediction));

// Write operations — admin and ops only
router.post('/analyze', requireAuth, requireRole('admin', 'ops'), asyncHandler(controller.analyze));
router.post('/retrain', requireAuth, requireRole('admin', 'ops'), asyncHandler(controller.retrain));
router.post('/train',   requireAuth, requireRole('admin', 'ops'), asyncHandler(controller.train));
// SSE: streams per-epoch training progress from the ML service
router.post('/train/stream', requireAuth, requireRole('admin', 'ops'), controller.trainStream);

module.exports = router;
