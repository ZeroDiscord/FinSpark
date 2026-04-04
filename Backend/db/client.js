'use strict';

const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: config.db.connectionString,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  logger.error({ event: 'pg_pool_error', error: err.message });
});

/**
 * Execute a parameterised SQL query.
 * @param {string} text  SQL string with $1, $2 … placeholders
 * @param {Array}  params  Values array
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  logger.debug({ event: 'db_query', duration_ms: Date.now() - start, rows: res.rowCount });
  return res;
}

module.exports = { pool, query };
