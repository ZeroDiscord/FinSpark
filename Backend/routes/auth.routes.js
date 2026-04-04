'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db/client');
const config = require('../config');
const requireAuth = require('../middleware/auth');
const { hashTenantId } = require('../utils/hashTenantId');

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

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userRes = await query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`,
      [email, passwordHash, full_name || null]
    );
    const userId = userRes.rows[0].id;

    const tenantHash = hashTenantId(company_name);
    const tenantRes = await query(
      `INSERT INTO tenants (owner_id, company_name, tenant_hash) VALUES ($1, $2, $3) RETURNING id`,
      [userId, company_name, tenantHash]
    );
    const tenantId = tenantRes.rows[0].id;

    const jwtPayload = { sub: userId, tenant_id: tenantHash, tenant_db_id: tenantId, role: 'admin' };
    const token = signAccess(jwtPayload);
    const refreshToken = signRefresh({ sub: userId });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    res.status(201).json({ user_id: userId, tenant_id: tenantHash, tenant_db_id: tenantId, token, refresh_token: refreshToken });
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

    const userRes = await query(
      `SELECT u.id, u.email, u.password_hash, u.role, t.id AS tenant_db_id, t.tenant_hash
       FROM users u
       LEFT JOIN tenants t ON t.owner_id = u.id
       WHERE u.email = $1
       LIMIT 1`,
      [email]
    );
    if (!userRes.rows.length) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = userRes.rows[0];
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
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

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
    const stored = await query(
      `SELECT id FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
      [tokenHash]
    );
    if (!stored.rows.length) {
      return res.status(401).json({ error: 'Refresh token revoked or expired.' });
    }

    const userRes = await query(
      `SELECT u.id, u.role, t.id AS tenant_db_id, t.tenant_hash
       FROM users u LEFT JOIN tenants t ON t.owner_id = u.id
       WHERE u.id = $1 LIMIT 1`,
      [payload.sub]
    );
    const user = userRes.rows[0];
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
      await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
