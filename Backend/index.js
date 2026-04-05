'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const fs = require('fs');
const { connectMongo } = require('./src/config/mongo');
const { startRetrainScheduler } = require('./src/scheduler/retrainScheduler');
const kafkaProducer = require('./src/services/kafka/kafkaProducer');

// Ensure upload directories exist
const dirs = [config.uploads.apkDir, config.uploads.csvDir];
dirs.forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

async function autoSeed() {
  try {
    const Tenant = require('./src/database/models/Tenant');
    const count = await Tenant.countDocuments();
    if (count === 0) {
      logger.info({ event: 'auto_seed_start', message: 'Empty database detected — running demo seed.' });
      const { seed } = require('./src/database/seeds/seedMongo');
      await seed(true); // true = skip connectDatabase (already connected)
      logger.info({ event: 'auto_seed_done' });
    }
  } catch (err) {
    logger.warn({ event: 'auto_seed_failed', error: err.message });
  }
}

async function start() {
  try {
    await connectMongo();
    await autoSeed();
    await kafkaProducer.init().catch((err) =>
      logger.warn({ event: 'kafka_init_failed', error: err.message })
    );
    startRetrainScheduler();
    app.listen(config.port, () => {
      logger.info({
        event: 'server_started',
        port: config.port,
        env: config.nodeEnv,
        ml_url: config.ml.baseUrl,
      });
      console.log(`\n  FinSpark Backend running on http://localhost:${config.port}`);
      console.log(`  ML Service target: ${config.ml.baseUrl}`);
      console.log(`  Environment: ${config.nodeEnv}\n`);
    });
  } catch (error) {
    logger.error({ event: 'server_start_failed', error: error.message });
    process.exit(1);
  }
}

start();
