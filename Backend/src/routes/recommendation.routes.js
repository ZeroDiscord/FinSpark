'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const controller = require('../controllers/recommendationController');

// Read — any authenticated user
router.get('/', requireAuth, asyncHandler(controller.list));
// Write — analyst and above (not viewer)
router.patch('/:id/dismiss', requireAuth, requireRole('admin', 'analyst', 'ops'), asyncHandler(controller.dismiss));
router.post('/:id/send-to-asana', requireAuth, requireRole('admin', 'analyst', 'ops'), asyncHandler(controller.sendToAsana));

module.exports = router;
