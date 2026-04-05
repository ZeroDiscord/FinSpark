'use strict';

/**
 * FinSpark Mock Dataset Generator
 * Generates mock_dataset.csv in the project root.
 *
 * Covers all 6 tenants (3 ML pre-trained + 3 demo MongoDB tenants).
 * Produces a lower-density mock dataset for local demos and uploads.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OUT_FILE = path.join(__dirname, 'mock_dataset.csv');
const SEED_DATE = new Date('2026-01-01T00:00:00Z');

// Pre-trained ML tenant hashes (from ML/data/models/)
const ML_TENANTS = [
  { tenant_id: '3d127f38b20808e3de2ebb01272653a73aea4b322df91732620f4df58c597f3a', company: 'Demo Lending Corp A', deployment_type: 'cloud',  churnBias: 0.22, dropOff: 'credit_scoring',      sessions: 70 },
  { tenant_id: '6f9f23c1c3baf1cf8b98ff7c9f6a898fdc35886ac731f909fd3f87a64e5364ab', company: 'Demo Lending Corp B', deployment_type: 'cloud',  churnBias: 0.55, dropOff: 'bureau_pull',         sessions: 65 },
  { tenant_id: 'c64d39a62a05695a0c105127d8b3d882be50549302cec2ec7be1fb1c667fe6ad', company: 'Demo Lending Corp C', deployment_type: 'onprem', churnBias: 0.38, dropOff: 'doc_upload',          sessions: 60 },
];

// MongoDB demo tenants (from seedMongo.js)
const DEMO_TENANTS = [
  { tenant_id: 'bank_a', company: 'Bank A Digital Lending',  deployment_type: 'cloud',  churnBias: 0.18, dropOff: 'KYC Verification',  sessions: 30 },
  { tenant_id: 'bank_b', company: 'Bank B Retail Credit',    deployment_type: 'onprem', churnBias: 0.58, dropOff: 'Credit Check',       sessions: 25 },
  { tenant_id: 'bank_c', company: 'Bank C SME Finance',      deployment_type: 'cloud',  churnBias: 0.42, dropOff: 'Upload Documents',   sessions: 25 },
];

// ---------------------------------------------------------------------------
// Feature Taxonomy
// ---------------------------------------------------------------------------

// ML service features (match ML/data/synthetic/lending_events.csv)
const ML_FEATURES = {
  origination: {
    loan_engine: ['income_verification', 'loan_offer_view', 'loan_accept', 'disbursement'],
    kyc_engine: ['kyc_check', 'doc_upload'],
    bureau: ['bureau_pull', 'credit_scoring', 'manual_review'],
    auth: ['login'],
  },
};

const ML_FEATURE_META = {
  login:               { l1_domain: 'origination', l2_module: 'auth',        l5_node_cloud: 'aws-us-east-1',  l5_node_onprem: 'onprem-ap-1',  baseDurationMs: 800  },
  kyc_check:           { l1_domain: 'origination', l2_module: 'kyc_engine',   l5_node_cloud: 'aws-us-east-1',  l5_node_onprem: 'onprem-ap-1',  baseDurationMs: 4200 },
  doc_upload:          { l1_domain: 'origination', l2_module: 'kyc_engine',   l5_node_cloud: 'aws-us-east-1',  l5_node_onprem: 'onprem-ap-1',  baseDurationMs: 6800 },
  income_verification: { l1_domain: 'origination', l2_module: 'loan_engine',  l5_node_cloud: 'aws-eu-west-1',  l5_node_onprem: 'onprem-ap-1',  baseDurationMs: 3100 },
  bureau_pull:         { l1_domain: 'origination', l2_module: 'bureau',       l5_node_cloud: 'aws-eu-west-1',  l5_node_onprem: 'onprem-ap-2',  baseDurationMs: 9400 },
  credit_scoring:      { l1_domain: 'origination', l2_module: 'bureau',       l5_node_cloud: 'aws-eu-west-1',  l5_node_onprem: 'onprem-ap-2',  baseDurationMs: 5200 },
  manual_review:       { l1_domain: 'origination', l2_module: 'bureau',       l5_node_cloud: 'aws-eu-west-1',  l5_node_onprem: 'onprem-ap-2',  baseDurationMs: 72000 },
  loan_offer_view:     { l1_domain: 'origination', l2_module: 'loan_engine',  l5_node_cloud: 'aws-us-east-1',  l5_node_onprem: 'onprem-ap-1',  baseDurationMs: 2300 },
  loan_accept:         { l1_domain: 'origination', l2_module: 'loan_engine',  l5_node_cloud: 'aws-us-east-1',  l5_node_onprem: 'onprem-ap-1',  baseDurationMs: 1600 },
  disbursement:        { l1_domain: 'origination', l2_module: 'loan_engine',  l5_node_cloud: 'aws-us-east-1',  l5_node_onprem: 'onprem-ap-1',  baseDurationMs: 2800 },
  drop_off:            { l1_domain: 'origination', l2_module: 'auth',         l5_node_cloud: 'aws-us-east-1',  l5_node_onprem: 'onprem-ap-1',  baseDurationMs: 0    },
};

// Demo/MongoDB tenant features (match seedMongo.js FEATURES)
const DEMO_FEATURE_META = {
  'Apply Loan':           { l1_domain: 'Loan Management', l2_module: 'Loan Application', baseDurationMs: 3200 },
  'Loan Eligibility':     { l1_domain: 'Loan Management', l2_module: 'Eligibility',       baseDurationMs: 2800 },
  'Upload Documents':     { l1_domain: 'Loan Management', l2_module: 'Loan Application',  baseDurationMs: 68000 },
  'Credit Check':         { l1_domain: 'Loan Management', l2_module: 'Risk Engine',        baseDurationMs: 74000 },
  'KYC Verification':     { l1_domain: 'Loan Management', l2_module: 'Compliance',         baseDurationMs: 39000 },
  'Offer Selection':      { l1_domain: 'Loan Management', l2_module: 'Offer Desk',          baseDurationMs: 5400 },
  'eMandate Setup':       { l1_domain: 'Payments',         l2_module: 'Mandates',           baseDurationMs: 7200 },
  'EMI Calculator':       { l1_domain: 'Payments',         l2_module: 'Affordability',      baseDurationMs: 2100 },
  'Bank Statement Upload':{ l1_domain: 'Documents',        l2_module: 'Statements',         baseDurationMs: 54000 },
  'Approval Dashboard':   { l1_domain: 'Operations',       l2_module: 'Approvals',          baseDurationMs: 16000 },
};

// ---------------------------------------------------------------------------
// Journey Blueprints
// ---------------------------------------------------------------------------

const ML_CHURN_PATHS = [
  ['login', 'kyc_check', 'doc_upload', 'kyc_check', 'drop_off'],
  ['login', 'bureau_pull', 'drop_off'],
  ['login', 'loan_offer_view', 'loan_offer_view', 'drop_off'],
  ['login', 'kyc_check', 'drop_off'],
  ['login', 'income_verification', 'doc_upload', 'kyc_check', 'drop_off'],
  ['login', 'drop_off'],
  ['login', 'kyc_check', 'doc_upload', 'bureau_pull', 'credit_scoring', 'drop_off'],
  ['login', 'kyc_check', 'doc_upload', 'bureau_pull', 'drop_off'],
  ['login', 'income_verification', 'kyc_check', 'drop_off'],
];

const ML_COMPLETE_PATHS = [
  ['login', 'kyc_check', 'doc_upload', 'bureau_pull', 'credit_scoring', 'loan_offer_view', 'loan_accept', 'disbursement'],
  ['login', 'income_verification', 'bureau_pull', 'credit_scoring', 'loan_offer_view', 'loan_accept', 'disbursement'],
  ['login', 'kyc_check', 'doc_upload', 'income_verification', 'bureau_pull', 'credit_scoring', 'manual_review', 'loan_offer_view', 'loan_accept', 'disbursement'],
  ['login', 'kyc_check', 'doc_upload', 'bureau_pull', 'loan_offer_view', 'loan_accept', 'disbursement'],
  ['login', 'income_verification', 'kyc_check', 'doc_upload', 'bureau_pull', 'credit_scoring', 'loan_offer_view', 'loan_accept', 'disbursement'],
];

const DEMO_JOURNEY_MAP = {
  bank_a: {
    churn:    [
      ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'KYC Verification'],
      ['Apply Loan', 'Loan Eligibility', 'KYC Verification'],
      ['Apply Loan', 'Upload Documents', 'KYC Verification'],
    ],
    complete: [
      ['Apply Loan', 'EMI Calculator', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Approval Dashboard'],
      ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Offer Selection', 'eMandate Setup', 'Approval Dashboard'],
      ['Apply Loan', 'EMI Calculator', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Offer Selection', 'Approval Dashboard'],
    ],
  },
  bank_b: {
    churn:    [
      ['Apply Loan', 'Upload Documents', 'Credit Check'],
      ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Credit Check'],
      ['Apply Loan', 'EMI Calculator', 'Upload Documents', 'Credit Check'],
    ],
    complete: [
      ['Apply Loan', 'EMI Calculator', 'Upload Documents', 'Credit Check', 'Offer Selection'],
      ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Offer Selection', 'eMandate Setup'],
    ],
  },
  bank_c: {
    churn:    [
      ['Apply Loan', 'Bank Statement Upload', 'Upload Documents', 'Upload Documents'],
      ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'KYC Verification', 'eMandate Setup'],
      ['Apply Loan', 'Upload Documents'],
    ],
    complete: [
      ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'KYC Verification', 'Approval Dashboard'],
      ['Apply Loan', 'EMI Calculator', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Approval Dashboard'],
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function jitter(base, pct = 0.25) {
  return Math.round(base * (1 + (Math.random() - 0.5) * pct * 2));
}

const CHANNELS = ['web', 'mobile', 'android', 'ios', 'assisted', 'api'];
const CHANNEL_WEIGHTS = [0.38, 0.25, 0.18, 0.10, 0.06, 0.03];

function pickChannel() {
  const r = Math.random();
  let cum = 0;
  for (let i = 0; i < CHANNELS.length; i++) {
    cum += CHANNEL_WEIGHTS[i];
    if (r < cum) return CHANNELS[i];
  }
  return 'web';
}

const FEEDBACK_CHURN = [
  'The loan offer page never loads properly, very frustrating.',
  'Credit check feels confusing and slow.',
  'Upload keeps failing on statement scan.',
  'Too many KYC fields before submit.',
  'Bureau pull took forever and then timed out.',
  'Kept getting errors on document upload.',
  'EMI calculator disappeared after I went back.',
  'App crashed mid-session during approval.',
  'Could not complete verification — gave up.',
  'Form reset every time I switched tabs.',
];

const FEEDBACK_POSITIVE = [
  'Really smooth process overall.',
  'Disbursement was faster than expected.',
  'Clear instructions at every step.',
  'Approval dashboard is very intuitive.',
  '',  // most completions have no feedback
  '',
  '',
];

function pickFeedback(churn, featureName, dropOff) {
  if (Math.random() > 0.32) return '';
  if (churn && featureName === dropOff) {
    return FEEDBACK_CHURN[Math.floor(Math.random() * FEEDBACK_CHURN.length)];
  }
  return FEEDBACK_POSITIVE[Math.floor(Math.random() * FEEDBACK_POSITIVE.length)];
}

function escapeCsv(value) {
  const str = String(value === null || value === undefined ? '' : value);
  // Always quote if the value contains commas, quotes, or newlines
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(obj) {
  return [
    obj.tenant_id,
    obj.session_id,
    obj.user_id,
    obj.timestamp,
    obj.deployment_type,
    obj.channel,
    obj.l1_domain,
    obj.l2_module,
    obj.l3_feature,
    obj.l4_action,
    obj.l5_deployment_node,
    obj.duration_ms,
    obj.success,
    escapeCsv(JSON.stringify(obj.metadata)),
    escapeCsv(obj.feedback_text || ''),
    obj.churn_label,
  ].join(',');
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

function generateMlTenantEvents(tenant) {
  const rows = [];
  const sessionStart = new Date(SEED_DATE);

  for (let s = 0; s < tenant.sessions; s++) {
    const isChurn = Math.random() < tenant.churnBias;
    const pool = isChurn ? ML_CHURN_PATHS : ML_COMPLETE_PATHS;
    const path = pool[Math.floor(Math.random() * pool.length)];

    const sessionId = hashId(`${tenant.tenant_id}_ml_session_${s}`);
    const userId = hashId(`${tenant.tenant_id}_user_${s % 40}`);
    const channel = pickChannel();
    const isOnprem = tenant.deployment_type === 'onprem';
    const churnLabel = isChurn ? 1 : 0;

    // Spread sessions over ~90 days
    const sessionOffset = Math.floor((s / tenant.sessions) * 90 * 24 * 60 * 60 * 1000);
    const sessionTime = new Date(sessionStart.getTime() + sessionOffset + Math.floor(Math.random() * 4 * 60 * 60 * 1000));

    path.forEach((feature, idx) => {
      if (feature === 'drop_off') return; // drop_off is not logged as an event
      const meta = ML_FEATURE_META[feature];
      if (!meta) return;

      const isLastBeforeDrop = isChurn && idx === path.length - 2 && path[path.length - 1] === 'drop_off';
      const isFinalEvent = idx === path.length - 1;
      const success = !isLastBeforeDrop;

      // On-prem bureau operations are slower
      const durationMultiplier = (isOnprem && (feature === 'bureau_pull' || feature === 'credit_scoring')) ? 2.4 : 1.0;
      const durationMs = jitter(meta.baseDurationMs * durationMultiplier);

      const ts = new Date(sessionTime.getTime() + idx * 90000 + Math.floor(Math.random() * 30000));

      rows.push(csvRow({
        tenant_id: tenant.tenant_id,
        session_id: sessionId,
        user_id: userId,
        timestamp: ts.toISOString(),
        deployment_type: tenant.deployment_type,
        channel,
        l1_domain: meta.l1_domain,
        l2_module: meta.l2_module,
        l3_feature: feature,
        l4_action: success ? 'complete' : 'fail',
        l5_deployment_node: isOnprem ? meta.l5_node_onprem : meta.l5_node_cloud,
        duration_ms: durationMs,
        success,
        metadata: { session_index: s, tenant: tenant.company },
        feedback_text: pickFeedback(!success || (isFinalEvent && isChurn), feature, tenant.dropOff),
        churn_label: churnLabel,
      }));
    });
  }

  return rows;
}

function generateDemoTenantEvents(tenant) {
  const rows = [];
  const journeyMap = DEMO_JOURNEY_MAP[tenant.tenant_id];
  const sessionStart = new Date(SEED_DATE);

  for (let s = 0; s < tenant.sessions; s++) {
    const isChurn = Math.random() < tenant.churnBias;
    const pool = isChurn ? journeyMap.churn : journeyMap.complete;
    const path = pool[Math.floor(Math.random() * pool.length)];

    const sessionId = `${tenant.tenant_id}_session_${String(s + 1).padStart(3, '0')}`;
    const userId = `${tenant.tenant_id}_user_${String((s % 8) + 1).padStart(2, '0')}`;
    const channel = s % 3 === 0 ? 'android' : s % 5 === 0 ? 'assisted' : 'web';
    const churnLabel = isChurn ? 1 : 0;

    const sessionOffset = Math.floor((s / tenant.sessions) * 90 * 24 * 60 * 60 * 1000);
    const sessionTime = new Date(sessionStart.getTime() + sessionOffset + Math.floor(Math.random() * 6 * 60 * 60 * 1000));

    path.forEach((feature, idx) => {
      const meta = DEMO_FEATURE_META[feature];
      if (!meta) return;

      const isLastStep = idx === path.length - 1;
      const isDropOff = isChurn && isLastStep;
      const success = !isDropOff;
      const durationMs = jitter(meta.baseDurationMs);
      const ts = new Date(sessionTime.getTime() + idx * 90000 + Math.floor(Math.random() * 20000));

      rows.push(csvRow({
        tenant_id: tenant.tenant_id,
        session_id: sessionId,
        user_id: userId,
        timestamp: ts.toISOString(),
        deployment_type: tenant.deployment_type,
        channel,
        l1_domain: meta.l1_domain,
        l2_module: meta.l2_module,
        l3_feature: feature,
        l4_action: success ? 'submit' : 'fail',
        l5_deployment_node: tenant.deployment_type === 'onprem' ? 'onprem-node-01' : 'cloud-node-01',
        duration_ms: durationMs,
        success,
        metadata: { session_index: s, tenant: tenant.company, demo: true },
        feedback_text: pickFeedback(isDropOff, feature, tenant.dropOff),
        churn_label: churnLabel,
      }));
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const HEADER = 'tenant_id,session_id,user_id,timestamp,deployment_type,channel,l1_domain,l2_module,l3_feature,l4_action,l5_deployment_node,duration_ms,success,metadata,feedback_text,churn_label';

const allRows = [HEADER];
let totalEvents = 0;

console.log('Generating mock dataset...\n');

for (const tenant of ML_TENANTS) {
  const rows = generateMlTenantEvents(tenant);
  allRows.push(...rows);
  totalEvents += rows.length;
  console.log(`  ${tenant.company.padEnd(26)} ${String(rows.length).padStart(5)} events  (${tenant.sessions} sessions, churnBias=${tenant.churnBias})`);
}

for (const tenant of DEMO_TENANTS) {
  const rows = generateDemoTenantEvents(tenant);
  allRows.push(...rows);
  totalEvents += rows.length;
  console.log(`  ${tenant.company.padEnd(26)} ${String(rows.length).padStart(5)} events  (${tenant.sessions} sessions, churnBias=${tenant.churnBias})`);
}

fs.writeFileSync(OUT_FILE, allRows.join('\n') + '\n', 'utf8');

console.log(`\n  Total events : ${totalEvents.toLocaleString()}`);
console.log(`  Tenants      : ${ML_TENANTS.length + DEMO_TENANTS.length}`);
console.log(`  Output       : mock_dataset.csv`);
console.log('\nDone.\n');
