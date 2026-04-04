'use strict';

const crypto = require('crypto');
const config = require('../config');

/**
 * Produce the same SHA-256 tenant hash that the ML service uses.
 * ML uses: SHA-256(company_name + pii_salt) as a hex string.
 * Must match ML/preprocessing/pii_masker.py behaviour.
 */
function hashTenantId(companyName) {
  return crypto
    .createHash('sha256')
    .update(companyName + config.piiSalt)
    .digest('hex');
}

module.exports = { hashTenantId };
