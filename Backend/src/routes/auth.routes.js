'use strict';

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');
const legacyAuthRoutes = require('../../routes/auth.routes');

router.post('/register', asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));
router.get('/me', requireAuth, asyncHandler(authController.me));
router.use('/', legacyAuthRoutes);

module.exports = router;
