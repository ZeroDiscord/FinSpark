'use strict';

/**
 * Kafka producer — optional. If KAFKA_BROKERS is not set the module is a no-op
 * so the backend stays functional in dev without Kafka running.
 */

let producer = null;
let ready = false;

async function init() {
  const brokers = process.env.KAFKA_BROKERS;
  if (!brokers) return; // Kafka disabled

  const { Kafka, logLevel, CompressionTypes } = require('kafkajs');
  const kafka = new Kafka({
    clientId: 'finspark-backend',
    brokers: brokers.split(','),
    logLevel: logLevel.WARN,
    retry: { initialRetryTime: 500, retries: 5 },
  });

  producer = kafka.producer({
    allowAutoTopicCreation: false,
    transactionTimeout: 30000,
    // Idempotent producer — at-least-once with dedup on broker side
    idempotent: true,
    maxInFlightRequests: 5,
  });

  await producer.connect();
  ready = true;
  console.log('[Kafka] Producer connected');
}

/**
 * Publish events to the feature-events topic.
 * Partitioned by tenant_id so all events for a tenant land on the same partition.
 * @param {object[]} events
 */
async function publishEvents(events) {
  if (!ready || !producer) return; // no-op when Kafka is not configured

  const messages = events.map((event) => ({
    key: event.tenant_id, // partition key → deterministic routing by tenant
    value: JSON.stringify(event),
  }));

  await producer.send({ topic: 'feature-events', messages });
}

async function shutdown() {
  if (producer) await producer.disconnect();
}

module.exports = { init, publishEvents, shutdown };
