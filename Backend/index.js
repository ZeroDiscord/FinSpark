'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const fs = require('fs');

// Ensure upload directories exist
const dirs = [config.uploads.apkDir, config.uploads.csvDir];
dirs.forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

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
