'use strict';

const { query } = require('../../db/client');

async function createUser({ email, passwordHash, fullName }) {
  const result = await query(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, full_name, role, created_at`,
    [email, passwordHash, fullName || null]
  );
  return result.rows[0];
}

async function findUserByEmail(email) {
  const result = await query(
    `SELECT u.*, t.id AS tenant_db_id, t.tenant_hash, t.company_name
     FROM users u
     LEFT JOIN tenants t ON t.owner_id = u.id
     WHERE u.email = $1
     LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await query(
    `SELECT id, email, full_name, role, created_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { createUser, findUserByEmail, findUserById };
