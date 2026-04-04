'use strict';

const { query } = require('../../db/client');

async function getAsanaConnection(tenantId) {
  const result = await query(
    `SELECT * FROM asana_connections WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  return result.rows[0] || null;
}

module.exports = { getAsanaConnection };
