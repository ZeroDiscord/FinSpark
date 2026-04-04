'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { createUser, findUserByEmail, findUserById } = require('../models/UserModel');
const { createTenant } = require('../models/TenantModel');
const { query } = require('../../db/client');
const { hashTenantId } = require('../../utils/hashTenantId');
const { ValidationError, UnauthorizedError } = require('../utils/errors');

function signAccess(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function signRefresh(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
}

async function persistRefreshToken(userId, refreshToken) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

async function register(req, res) {
  const { email, password, company_name, full_name } = req.body;
  if (!email || !password || !company_name) {
    throw new ValidationError('email, password, and company_name are required.');
  }

  const existing = await findUserByEmail(email);
  if (existing) throw new ValidationError('Email already registered.');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUser({ email, passwordHash, fullName: full_name });
  const tenant = await createTenant({
    ownerId: user.id,
    companyName: company_name,
    tenantHash: hashTenantId(company_name),
  });

  const payload = { sub: user.id, tenant_id: tenant.tenant_hash, tenant_db_id: tenant.id, role: 'admin' };
  const token = signAccess(payload);
  const refresh_token = signRefresh({ sub: user.id });
  await persistRefreshToken(user.id, refresh_token);

  return res.status(201).json({
    token,
    refresh_token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      tenant_id: tenant.tenant_hash,
      tenant_db_id: tenant.id,
    },
  });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) throw new ValidationError('email and password are required.');

  const user = await findUserByEmail(email);
  if (!user) throw new UnauthorizedError('Invalid credentials.');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid credentials.');

  const payload = {
    sub: user.id,
    tenant_id: user.tenant_hash,
    tenant_db_id: user.tenant_db_id,
    role: user.role,
  };
  const token = signAccess(payload);
  const refresh_token = signRefresh({ sub: user.id });
  await persistRefreshToken(user.id, refresh_token);

  return res.json({
    token,
    refresh_token,
    user: {
      id: user.id,
      email: user.email,
      tenant_id: user.tenant_hash,
      tenant_db_id: user.tenant_db_id,
    },
  });
}

async function me(req, res) {
  const user = await findUserById(req.user.sub);
  return res.json({
    ...user,
    tenant_id: req.user.tenant_id,
    tenant_db_id: req.user.tenant_db_id,
  });
}

module.exports = { register, login, me };
