'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');
const config = require('../config/env');
const RefreshToken = require('../database/models/RefreshToken');
const { findUserById } = require('../models/UserModel');

router.post('/register', asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));
router.get('/me', requireAuth, asyncHandler(authController.me));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required.' });

  let payload;
  try {
    payload = jwt.verify(refresh_token, config.jwt.refreshSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }

  const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
  const stored = await RefreshToken.findOne({
    token_hash: tokenHash,
    revoked: false,
    expires_at: { $gt: new Date() },
  }).lean();
  if (!stored) return res.status(401).json({ error: 'Refresh token revoked or expired.' });

  const user = await findUserById(payload.sub);
  if (!user) return res.status(401).json({ error: 'User not found.' });

  const token = jwt.sign(
    { sub: user.id, tenant_id: user.tenant_hash, tenant_db_id: user.tenant_db_id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  return res.json({ token });
}));

// POST /api/auth/logout
router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    await RefreshToken.updateOne({ token_hash: tokenHash }, { $set: { revoked: true } });
  }
  return res.json({ success: true });
}));

module.exports = router;
