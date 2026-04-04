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
router.get('/workspaces', requireAuth, asyncHandler(controller.workspaces));
router.get('/projects', requireAuth, asyncHandler(controller.projects));
router.get('/sections', requireAuth, asyncHandler(controller.sections));
router.post('/mapping', requireAuth, asyncHandler(controller.saveMapping));
router.post('/task', requireAuth, asyncHandler(controller.createTask));
router.post('/tasks', requireAuth, asyncHandler(controller.createTask));
router.post('/send-bulk', requireAuth, asyncHandler(controller.sendBulk));
router.use('/', legacyAsanaRoutes);

module.exports = router;
