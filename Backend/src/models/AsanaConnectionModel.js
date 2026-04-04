'use strict';

const { AsanaConnection } = require('../database/models');

async function getAsanaConnection(tenantId) {
  return AsanaConnection.findOne({ tenant_id: tenantId }).lean();
}

module.exports = { getAsanaConnection };
