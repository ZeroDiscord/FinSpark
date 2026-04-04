'use strict';

const mongoose = require('mongoose');
const config = require('./env');
const logger = require('../../utils/logger');

let connected = false;

async function connectMongo() {
  if (connected) return;

  const uri = config.mongo.uri || 'mongodb://127.0.0.1:27017/finspark';
  await mongoose.connect(uri, {
    dbName: config.mongo.dbName,
  });

  connected = true;
  logger.info({ event: 'mongo_connected', dbName: config.mongo.dbName });
}

module.exports = { connectMongo };
