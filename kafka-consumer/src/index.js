'use strict';

const { Kafka, logLevel } = require('kafkajs');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB = process.env.MONGO_DB_NAME || 'finspark';
const CSV_PATH = process.env.CSV_PATH || path.join(__dirname, '../../datasets/events.csv');
const CSV_HEADER = 'tenant_id,session_id,user_id,timestamp,deployment_type,channel,l1_domain,l2_module,l3_feature,l4_action,l5_deployment_node,duration_ms,success,metadata,feedback_text,churn_label\n';

// ── MongoDB schema ──────────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema({
  tenant_id: String,
  session_id: String,
  user_id: String,
  timestamp: String,
  deployment_type: String,
  channel: String,
  l1_domain: String,
  l2_module: String,
  l3_feature: String,
  l4_action: String,
  l5_deployment_node: String,
  duration_ms: Number,
  success: Boolean,
  metadata: mongoose.Schema.Types.Mixed,
  feedback_text: String,
  churn_label: Number,
}, { collection: 'usage_events', timestamps: false });

const UsageEvent = mongoose.model('UsageEvent', eventSchema);

// ── CSV helper ───────────────────────────────────────────────────────────────
function ensureCsvHeader() {
  const dir = path.dirname(CSV_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CSV_PATH)) fs.writeFileSync(CSV_PATH, CSV_HEADER);
}

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function appendToCsv(event) {
  const row = [
    event.tenant_id,
    event.session_id,
    event.user_id,
    event.timestamp,
    event.deployment_type,
    event.channel,
    event.l1_domain,
    event.l2_module,
    event.l3_feature,
    event.l4_action,
    event.l5_deployment_node,
    event.duration_ms ?? '',
    event.success ?? '',
    typeof event.metadata === 'object' ? JSON.stringify(event.metadata) : (event.metadata || ''),
    event.feedback_text || '',
    event.churn_label ?? '',
  ].map(escapeCsvField).join(',');

  fs.appendFileSync(CSV_PATH, row + '\n');
}

// ── Kafka setup ──────────────────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: 'finspark-consumer',
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.WARN,
  retry: { initialRetryTime: 1000, retries: 10 },
});

const consumer = kafka.consumer({ groupId: 'finspark-main-consumer' });
const dlqProducer = kafka.producer();

async function processBatch(messages) {
  const events = [];
  const dlqMessages = [];

  for (const msg of messages) {
    try {
      const event = JSON.parse(msg.value.toString());
      if (!event.tenant_id || !event.session_id) {
        throw new Error('Missing required fields: tenant_id or session_id');
      }
      events.push(event);
    } catch (err) {
      console.warn(`[DLQ] Malformed message: ${err.message}`);
      dlqMessages.push({
        key: msg.key,
        value: msg.value,
        headers: { ...msg.headers, 'dlq-reason': Buffer.from(err.message) },
      });
    }
  }

  // Write to MongoDB in bulk
  if (events.length > 0) {
    try {
      await UsageEvent.insertMany(events, { ordered: false });
    } catch (err) {
      // ordered:false — partial success is fine; duplicates are warned not thrown
      if (err.code !== 11000) console.error('[MongoDB] insertMany error:', err.message);
    }

    // Append to CSV
    for (const event of events) {
      appendToCsv(event);
    }

    console.log(`[Consumer] Processed ${events.length} events`);
  }

  // Send failures to DLQ
  if (dlqMessages.length > 0) {
    await dlqProducer.send({ topic: 'feature-events-dlq', messages: dlqMessages });
    console.warn(`[DLQ] Forwarded ${dlqMessages.length} messages`);
  }
}

async function main() {
  // Connect MongoDB
  await mongoose.connect(`${MONGO_URI}/${MONGO_DB}`);
  console.log('[Consumer] MongoDB connected');

  ensureCsvHeader();

  await dlqProducer.connect();
  await consumer.connect();

  await consumer.subscribe({ topics: ['feature-events'], fromBeginning: false });

  await consumer.run({
    eachBatch: async ({ batch, heartbeat, resolveOffset, commitOffsetsIfNecessary }) => {
      const CHUNK_SIZE = 100;
      const msgs = batch.messages;

      for (let i = 0; i < msgs.length; i += CHUNK_SIZE) {
        const chunk = msgs.slice(i, i + CHUNK_SIZE);
        await processBatch(chunk);
        resolveOffset(chunk[chunk.length - 1].offset);
        await commitOffsetsIfNecessary();
        await heartbeat();
      }
    },
  });

  console.log('[Consumer] Listening on feature-events...');
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  console.log('[Consumer] Shutting down...');
  await consumer.disconnect();
  await dlqProducer.disconnect();
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[Consumer] Fatal error:', err);
  process.exit(1);
});
