'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/asanaController');
const legacyAsanaRoutes = require('../../routes/asana.routes');

router.get('/status', requireAuth, asyncHandler(controller.status));
router.get('/connect', requireAuth, asyncHandler(controller.connect));
router.get('/oauth/connect', requireAuth, asyncHandler(controller.connect));
router.get('/callback', asyncHandler(controller.callback));
router.get('/oauth/callback', asyncHandler(controller.callback));
router.get('/projects', requireAuth, asyncHandler(controller.projects));
router.post('/task', requireAuth, asyncHandler(controller.createTask));
router.post('/tasks', requireAuth, asyncHandler(controller.createTask));
router.use('/', legacyAsanaRoutes);

module.exports = router;
