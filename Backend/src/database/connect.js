'use strict';

const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const config = require('../config/env');

let connectionPromise = null;

async function connectDatabase() {
  if (!config.mongo.uri) {
    logger.warn({ event: 'mongo_uri_missing', message: 'MONGO_URI not configured; Mongo database layer is disabled.' });
    return null;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(config.mongo.uri, {
      dbName: config.mongo.dbName,
      maxPoolSize: 20,
      autoIndex: true,
    });
  }

  await connectionPromise;
  logger.info({ event: 'mongo_database_connected', dbName: config.mongo.dbName });
  return mongoose.connection;
}

module.exports = { connectDatabase };
