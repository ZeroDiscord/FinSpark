'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const requireAuth = require('../middleware/auth');
const { hashTenantId } = require('../utils/hashTenantId');
const { createUser, findUserByEmail, findUserById } = require('../src/models/UserModel');
const { createTenant } = require('../src/models/TenantModel');
const RefreshToken = require('../src/database/models/RefreshToken');

function signAccess(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function signRefresh(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, company_name, full_name } = req.body;
    if (!email || !password || !company_name) {
      return res.status(400).json({ error: 'email, password, and company_name are required.' });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const tenantHash = hashTenantId(company_name);
    const tenant = await createTenant({ companyName: company_name, tenantHash });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({
      email,
      passwordHash,
      fullName: full_name,
      tenantId: tenant.tenant_hash,
    });

    const jwtPayload = { sub: user.id, tenant_id: tenantHash, tenant_db_id: tenant.id, role: 'admin' };
    const token = signAccess(jwtPayload);
    const refreshToken = signRefresh({ sub: user.id });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });

    res.status(201).json({
      user_id: user.id,
      tenant_id: tenantHash,
      tenant_db_id: tenant.id,
      token,
      refresh_token: refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const jwtPayload = {
      sub: user.id,
      tenant_id: user.tenant_hash,
      tenant_db_id: user.tenant_db_id,
      role: user.role,
    };
    const token = signAccess(jwtPayload);
    const refreshToken = signRefresh({ sub: user.id });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });

    res.json({
      token,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email, tenant_id: user.tenant_hash, tenant_db_id: user.tenant_db_id },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
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
    if (!stored) {
      return res.status(401).json({ error: 'Refresh token revoked or expired.' });
    }

    const user = await findUserById(payload.sub);
    const token = signAccess({
      sub: user.id,
      tenant_id: user.tenant_hash,
      tenant_db_id: user.tenant_db_id,
      role: user.role,
    });

    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
      await RefreshToken.updateOne({ token_hash: tokenHash }, { $set: { revoked: true } });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
