'use strict';

const rootConfig = require('../../config');

module.exports = {
  ...rootConfig,
  mongo: {
    uri: process.env.MONGO_URI || '',
    dbName: process.env.MONGO_DB_NAME || 'finspark',
  },
  database: {
    provider: 'mongodb',
  },
};
