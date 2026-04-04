'use strict';

const logger = require('../../utils/logger');
const { runRetrainTrigger } = require('../services/ml/predictionIntegrationService');

function startRetrainScheduler() {
  let cron;
  try {
    cron = require('node-cron');
  } catch (error) {
    logger.warn({
      event: 'retrain_scheduler_disabled',
      reason: 'node-cron not installed',
    });
    return null;
  }

  const expression = process.env.ML_RETRAIN_CRON || '0 2 */10 * *';
  const task = cron.schedule(expression, async () => {
    try {
      await runRetrainTrigger({
        tenantId: null,
        reason: 'scheduled',
      });
      logger.info({ event: 'retrain_scheduler_run_completed', expression });
    } catch (error) {
      logger.error({ event: 'retrain_scheduler_run_failed', expression, error: error.message });
    }
  });

  logger.info({ event: 'retrain_scheduler_started', expression });
  return task;
}

module.exports = { startRetrainScheduler };
