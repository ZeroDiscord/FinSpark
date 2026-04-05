'use strict';

/**
 * FinSpark On-Prem Federated Agent (mock)
 *
 * Simulates an agent running inside an on-premise deployment.
 * It reads raw local event data, aggregates metrics locally,
 * anonymizes user IDs, and pushes ONLY the aggregate snapshot
 * to the central FinSpark cloud hub — never raw events.
 *
 * Usage:
 *   node onprem-agent/index.js
 *
 * Environment variables:
 *   HUB_URL          Central FinSpark API (default: http://localhost:3001)
 *   AGENT_TOKEN      JWT token for the on-prem tenant (required)
 *   DEPLOYMENT_NODE  Node identifier (default: onprem-ap-1)
 *   SYNC_INTERVAL_MS How often to sync in ms (default: 300000 = 5 min)
 */

const https = require('https');
const http  = require('http');
const crypto = require('crypto');

const HUB_URL         = process.env.HUB_URL         || 'http://localhost:3001';
const AGENT_TOKEN     = process.env.AGENT_TOKEN      || '';
const DEPLOYMENT_NODE = process.env.DEPLOYMENT_NODE  || 'onprem-ap-1';
const SYNC_INTERVAL   = Number(process.env.SYNC_INTERVAL_MS) || 300_000;
const AGENT_VERSION   = '1.0.0';

// ---------------------------------------------------------------------------
// Local event store (in production this would read from a local DB/CSV)
// ---------------------------------------------------------------------------
let localEvents = generateMockLocalEvents();

function generateMockLocalEvents() {
  const features = [
    { l3_feature: 'doc_upload',          l2_module: 'kyc_engine'  },
    { l3_feature: 'kyc_check',           l2_module: 'kyc_engine'  },
    { l3_feature: 'bureau_pull',         l2_module: 'bureau'      },
    { l3_feature: 'credit_scoring',      l2_module: 'bureau'      },
    { l3_feature: 'income_verification', l2_module: 'loan_engine' },
    { l3_feature: 'loan_offer_view',     l2_module: 'loan_engine' },
    { l3_feature: 'loan_accept',         l2_module: 'loan_engine' },
    { l3_feature: 'disbursement',        l2_module: 'loan_engine' },
  ];

  const events = [];
  const now = Date.now();

  for (let s = 0; s < 40; s++) {
    // Hash the user_id locally — never send raw user identifiers to hub
    const rawUserId = `local-user-${s % 15}`;
    const anonymizedUserId = crypto.createHash('sha256').update(rawUserId).digest('hex').slice(0, 16);
    const sessionId = crypto.randomUUID();
    const sessionStart = now - Math.random() * 86_400_000 * 7;
    let cursor = sessionStart;

    const journey = features.slice(0, Math.floor(Math.random() * features.length) + 2);
    for (const feature of journey) {
      cursor += Math.random() * 60_000;
      events.push({
        session_id:      sessionId,
        user_id:         anonymizedUserId, // already anonymized
        l3_feature:      feature.l3_feature,
        l2_module:       feature.l2_module,
        timestamp:       new Date(cursor).toISOString(),
        duration_ms:     Math.floor(Math.random() * 8000 + 500),
        success:         Math.random() > 0.15,
        deployment_type: 'onprem',
        channel:         'web',
      });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Local aggregation — never sends raw events to hub
// ---------------------------------------------------------------------------
function aggregateLocally(events) {
  const sessionIds      = new Set(events.map((e) => e.session_id));
  const userIds         = new Set(events.map((e) => e.user_id).filter(Boolean));
  const featureCounts   = new Map();
  const dropOffCounts   = new Map();
  let   durationSum     = 0;

  // Count per-feature usage
  for (const event of events) {
    const f = event.l3_feature || 'unknown';
    if (!featureCounts.has(f)) featureCounts.set(f, { l3_feature: f, usage_count: 0, sessions: new Set() });
    const row = featureCounts.get(f);
    row.usage_count += 1;
    row.sessions.add(event.session_id);
    if (!event.success) {
      dropOffCounts.set(f, (dropOffCounts.get(f) || 0) + 1);
    }
    durationSum += Number(event.duration_ms || 0);
  }

  // Simple churn estimate: sessions where last feature failed
  const sessionLastFailure = new Map();
  for (const event of [...events].reverse()) {
    if (!sessionLastFailure.has(event.session_id)) {
      sessionLastFailure.set(event.session_id, !event.success);
    }
  }
  const churnedCount = [...sessionLastFailure.values()].filter(Boolean).length;

  return {
    snapshot_period: new Date().toISOString().slice(0, 10),
    deployment_node: DEPLOYMENT_NODE,
    agent_version:   AGENT_VERSION,
    metrics: {
      total_sessions:          sessionIds.size,
      active_users:            userIds.size,
      churn_rate:              sessionIds.size ? Number((churnedCount / sessionIds.size).toFixed(4)) : 0,
      avg_session_duration_ms: events.length ? Math.round(durationSum / events.length) : 0,
    },
    feature_counts: [...featureCounts.values()].map((row) => ({
      l3_feature:      row.l3_feature,
      usage_count:     row.usage_count,
      unique_sessions: row.sessions.size,
    })),
    top_drop_off_features: [...dropOffCounts.entries()]
      .map(([feature, drop_off_count]) => ({ feature, drop_off_count }))
      .sort((a, b) => b.drop_off_count - a.drop_off_count)
      .slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// HTTP push to central hub
// ---------------------------------------------------------------------------
function postToHub(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url  = new URL('/api/federated/sync', HUB_URL);
    const lib  = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization:    `Bearer ${AGENT_TOKEN}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Hub responded ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Sync cycle
// ---------------------------------------------------------------------------
async function runSyncCycle() {
  try {
    console.log(`[onprem-agent] Aggregating ${localEvents.length} local events...`);
    const snapshot = aggregateLocally(localEvents);

    if (!AGENT_TOKEN) {
      console.log('[onprem-agent] No AGENT_TOKEN set — printing snapshot (dry run):');
      console.log(JSON.stringify(snapshot, null, 2));
      return;
    }

    const result = await postToHub(snapshot);
    console.log(`[onprem-agent] Snapshot accepted by hub. snapshot_id=${result.snapshot_id}`);

    // After sync, refresh local mock events (in production: events accumulate in local DB)
    localEvents = generateMockLocalEvents();
  } catch (err) {
    console.error('[onprem-agent] Sync failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`[onprem-agent] Starting. Hub=${HUB_URL} Node=${DEPLOYMENT_NODE} Interval=${SYNC_INTERVAL}ms`);
runSyncCycle();
setInterval(runSyncCycle, SYNC_INTERVAL);
