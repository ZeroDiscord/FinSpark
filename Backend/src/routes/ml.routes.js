'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/mlController');

router.post('/analyze', asyncHandler(controller.analyze));
router.get('/predictions', asyncHandler(controller.listPredictions));
router.get('/predictions/:sessionId', asyncHandler(controller.getPrediction));
router.post('/retrain', asyncHandler(controller.retrain));
router.post('/train', asyncHandler(controller.train));
// SSE: streams per-epoch training progress from the ML service
router.post('/train/stream', controller.trainStream);

module.exports = router;
