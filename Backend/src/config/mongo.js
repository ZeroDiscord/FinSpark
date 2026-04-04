'use strict';

const mongoose = require('mongoose');
const config = require('./env');
const logger = require('../../utils/logger');

let connected = false;

async function connectMongo() {
  if (!config.mongo.uri || connected) return;

  await mongoose.connect(config.mongo.uri, {
    dbName: config.mongo.dbName,
  });

  connected = true;
  logger.info({ event: 'mongo_connected', dbName: config.mongo.dbName });
}

module.exports = { connectMongo };
