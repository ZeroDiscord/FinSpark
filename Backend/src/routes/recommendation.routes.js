'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/recommendationController');
const legacyRecommendationRoutes = require('../../routes/recommend.routes');

router.get('/', requireAuth, asyncHandler(controller.list));
router.patch('/:id/dismiss', requireAuth, asyncHandler(controller.dismiss));
router.post('/:id/send-to-asana', requireAuth, asyncHandler(controller.sendToAsana));
router.use('/', legacyRecommendationRoutes);

module.exports = router;
