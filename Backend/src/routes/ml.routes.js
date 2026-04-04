'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/mlController');

router.post('/analyze', asyncHandler(controller.analyze));
router.get('/predictions', asyncHandler(controller.listPredictions));
router.get('/predictions/:sessionId', asyncHandler(controller.getPrediction));
router.post('/retrain', asyncHandler(controller.retrain));

module.exports = router;
