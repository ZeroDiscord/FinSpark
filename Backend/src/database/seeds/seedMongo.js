'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { connectDatabase } = require('../connect');
const {
  Tenant,
  User,
  DetectedFeature,
  Recommendation,
  UsageEvent,
  ProcessedSession,
  MlPrediction,
  AsanaConnection,
} = require('../models');

const FEATURES = [
  { l1_domain: 'Loan Management', l2_module: 'Loan Application', l3_feature: 'Apply Loan' },
  { l1_domain: 'Loan Management', l2_module: 'Loan Application', l3_feature: 'Upload Documents' },
  { l1_domain: 'Loan Management', l2_module: 'Risk Engine', l3_feature: 'Credit Check' },
  { l1_domain: 'Loan Management', l2_module: 'Compliance', l3_feature: 'KYC Verification' },
  { l1_domain: 'Loan Management', l2_module: 'Eligibility', l3_feature: 'Loan Eligibility' },
  { l1_domain: 'Loan Management', l2_module: 'Offer Desk', l3_feature: 'Offer Selection' },
  { l1_domain: 'Payments', l2_module: 'Mandates', l3_feature: 'eMandate Setup' },
  { l1_domain: 'Payments', l2_module: 'Affordability', l3_feature: 'EMI Calculator' },
  { l1_domain: 'Documents', l2_module: 'Statements', l3_feature: 'Bank Statement Upload' },
  { l1_domain: 'Operations', l2_module: 'Approvals', l3_feature: 'Approval Dashboard' },
];

const TENANTS = [
  {
    tenant_key: 'bank_a',
    email_prefix: 'banka',
    company_name: 'Bank A Digital Lending',
    deployment_mode: 'cloud',
    sessions: 20,
    churnBias: 0.18,
    dominantDropOff: 'KYC Verification',
  },
  {
    tenant_key: 'bank_b',
    email_prefix: 'bankb',
    company_name: 'Bank B Retail Credit',
    deployment_mode: 'onprem',
    sessions: 15,
    churnBias: 0.58,
    dominantDropOff: 'Credit Check',
  },
  {
    tenant_key: 'bank_c',
    email_prefix: 'bankc',
    company_name: 'Bank C SME Finance',
    deployment_mode: 'cloud',
    sessions: 15,
    churnBias: 0.42,
    dominantDropOff: 'Upload Documents',
  },
];

function buildSessionBlueprint(tenantKey, index) {
  const basePath = ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Offer Selection', 'eMandate Setup', 'Approval Dashboard'];

  if (tenantKey === 'bank_a') {
    if (index % 5 === 0) return { path: ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'KYC Verification'], dropOff: 'KYC Verification', churn: 0.39 };
    if (index % 4 === 0) return { path: ['Apply Loan', 'EMI Calculator', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Approval Dashboard'], dropOff: null, churn: 0.12 };
    return { path: basePath, dropOff: null, churn: 0.08 };
  }

  if (tenantKey === 'bank_b') {
    if (index % 3 === 0) return { path: ['Apply Loan', 'Upload Documents', 'Credit Check'], dropOff: 'Credit Check', churn: 0.78 };
    if (index % 4 === 0) return { path: ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'Credit Check', 'Credit Check'], dropOff: 'Credit Check', churn: 0.71 };
    return { path: ['Apply Loan', 'EMI Calculator', 'Upload Documents', 'Credit Check', 'Offer Selection'], dropOff: 'Credit Check', churn: 0.63 };
  }

  if (index % 3 === 0) return { path: ['Apply Loan', 'Bank Statement Upload', 'Upload Documents', 'Upload Documents'], dropOff: 'Upload Documents', churn: 0.67 };
  if (index % 4 === 0) return { path: ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'KYC Verification', 'eMandate Setup'], dropOff: 'eMandate Setup', churn: 0.54 };
  return { path: ['Apply Loan', 'Loan Eligibility', 'Upload Documents', 'KYC Verification', 'Approval Dashboard'], dropOff: null, churn: 0.21 };
}

function featureMetaMap() {
  const map = new Map();
  for (const row of FEATURES) map.set(row.l3_feature, row);
  return map;
}

async function seed(skipConnect = false) {
  if (!skipConnect) await connectDatabase();

  await Promise.all([
    Tenant.deleteMany({}),
    User.deleteMany({}),
    DetectedFeature.deleteMany({}),
    Recommendation.deleteMany({}),
    UsageEvent.deleteMany({}),
    ProcessedSession.deleteMany({}),
    MlPrediction.deleteMany({}),
    AsanaConnection.deleteMany({}),
  ]);

  await Tenant.insertMany(TENANTS.map((tenant) => ({
    tenant_key: tenant.tenant_key,
    company_name: tenant.company_name,
    deployment_mode: tenant.deployment_mode,
    status: 'active',
    plan: 'enterprise',
    settings: {
      timezone: 'Asia/Calcutta',
      retention_days: 365,
      dashboard_cache_ttl_seconds: 300,
    },
  })));

  const passwordHash = await bcrypt.hash('Demo@1234', 10);
  const demoUsers = [];
  for (const tenant of TENANTS) {
    demoUsers.push({
      tenant_id: tenant.tenant_key,
      email: `ops@${tenant.email_prefix}.com`,
      password_hash: passwordHash,
      full_name: `${tenant.company_name} Ops`,
      role: 'admin',
    });
    demoUsers.push({
      tenant_id: tenant.tenant_key,
      email: `pm@${tenant.email_prefix}.com`,
      password_hash: passwordHash,
      full_name: `${tenant.company_name} PM`,
      role: 'analyst',
    });
  }
  await User.insertMany(demoUsers);

  const featureDocs = [];
  for (const tenant of TENANTS) {
    for (const feature of FEATURES) {
      featureDocs.push({
        tenant_id: tenant.tenant_key,
        name: feature.l3_feature,
        l1_domain: feature.l1_domain,
        l2_module: feature.l2_module,
        l3_feature: feature.l3_feature,
        source_type: 'demo_seed',
        confidence: 0.94,
      });
    }
  }
  await DetectedFeature.insertMany(featureDocs);

  const events = [];
  const sessions = [];
  const predictions = [];
  const featureLookup = featureMetaMap();
  const seedBase = new Date(Date.UTC(2026, 3, 1, 4, 0, 0));

  for (const tenant of TENANTS) {
    for (let sessionIndex = 1; sessionIndex <= tenant.sessions; sessionIndex += 1) {
      const blueprint = buildSessionBlueprint(tenant.tenant_key, sessionIndex);
      const sessionId = `${tenant.tenant_key}_session_${String(sessionIndex).padStart(3, '0')}`;
      const userId = `${tenant.tenant_key}_user_${String(((sessionIndex - 1) % 8) + 1).padStart(2, '0')}`;
      const sessionStart = new Date(seedBase.getTime() + (sessionIndex * 45 * 60 * 1000));
      const channel = sessionIndex % 3 === 0 ? 'android' : sessionIndex % 5 === 0 ? 'assisted' : 'web';
      const deploymentType = tenant.deployment_mode;
      const durationSequence = [];
      const successSequence = [];
      const actionSequence = [];
      let failureCount = 0;
      let retryCount = 0;
      let totalDuration = 0;

      blueprint.path.forEach((featureName, featureIndex) => {
        const meta = featureLookup.get(featureName);
        const isRetry = featureIndex > 0 && blueprint.path[featureIndex - 1] === featureName;
        const success = !(blueprint.dropOff === featureName && featureIndex === blueprint.path.length - 1);
        const durationMs =
          featureName === 'Credit Check' && tenant.tenant_key === 'bank_b' ? 74000 :
          featureName === 'Upload Documents' && tenant.tenant_key === 'bank_c' ? 68000 :
          featureName === 'Approval Dashboard' ? 16000 :
          22000 + (featureIndex * 6000);

        if (!success) failureCount += 1;
        if (isRetry) retryCount += 1;

        durationSequence.push(durationMs);
        successSequence.push(success);
        actionSequence.push(success ? 'submit' : 'fail');
        totalDuration += durationMs;

        events.push({
          tenant_id: tenant.tenant_key,
          session_id: sessionId,
          user_id: userId,
          timestamp: new Date(sessionStart.getTime() + (featureIndex * 90 * 1000)),
          deployment_type: deploymentType,
          channel,
          l1_domain: meta.l1_domain,
          l2_module: meta.l2_module,
          l3_feature: featureName,
          l4_action: success ? 'submit' : 'fail',
          l5_deployment_node: deploymentType === 'cloud' ? 'cloud-node-01' : 'onprem-node-01',
          duration_ms: durationMs,
          success,
          metadata: {
            demo: true,
            step_order: featureIndex + 1,
            tenant_story: tenant.dominantDropOff,
          },
          feedback_text:
            featureName === 'Credit Check' && !success ? 'Credit check feels confusing and slow' :
            featureName === 'Upload Documents' && !success ? 'Upload keeps failing on statement scan' :
            featureName === 'KYC Verification' && !success ? 'Too many KYC fields before submit' :
            '',
          churn_label: blueprint.churn >= 0.7 ? 1 : 0,
        });
      });

      sessions.push({
        tenant_id: tenant.tenant_key,
        session_id: sessionId,
        user_id: userId,
        session_start: sessionStart,
        session_end: new Date(sessionStart.getTime() + totalDuration + (blueprint.path.length * 90 * 1000)),
        feature_sequence: blueprint.path,
        action_sequence: actionSequence,
        duration_sequence_ms: durationSequence,
        success_sequence: successSequence,
        avg_duration_ms: Math.round(totalDuration / blueprint.path.length),
        total_duration_ms: totalDuration,
        session_length_ms: totalDuration + (blueprint.path.length * 90 * 1000),
        feature_count: blueprint.path.length,
        failure_count: failureCount,
        success_count: successSequence.filter(Boolean).length,
        retry_count: retryCount,
        previous_feature: blueprint.path[blueprint.path.length - 2] || null,
        drop_off_feature: blueprint.dropOff,
        hour_of_day: sessionStart.getUTCHours(),
        day_of_week: sessionStart.getUTCDay(),
        churn_label: blueprint.churn >= 0.7 ? 1 : 0,
        source_event_count: blueprint.path.length,
      });

      predictions.push({
        tenant_id: tenant.tenant_key,
        session_id: sessionId,
        model_name: 'demo_ensemble',
        model_version: 'hackathon_v1',
        churn_probability: blueprint.churn,
        drop_off_feature: blueprint.dropOff,
        inference_ms: 82,
        request_payload: { demo: true },
        response_payload: { path: blueprint.path },
      });
    }
  }

  await UsageEvent.insertMany(events);
  await ProcessedSession.insertMany(sessions);
  await MlPrediction.insertMany(predictions);

  await Recommendation.insertMany([
    {
      tenant_id: 'bank_b',
      title: 'Improve Credit Check',
      problem: '72% of sessions touching Credit Check are predicted to churn.',
      suggestion: 'Move Credit Check later in the journey and prefill bureau inputs where possible.',
      priority: 'critical',
      category: 'high_churn',
      churn_score: 0.72,
      impact_score: 91,
      metrics: { churn_rate: 0.72, usage_count: 48, failure_rate: 0.14, avg_duration_ms: 74000 },
      status: 'open',
      dedupe_key: 'bank_b:high_churn:credit_check:global',
      source_data: { feature: 'Credit Check', rule_id: 'feature_churn_rate' },
    },
    {
      tenant_id: 'bank_c',
      title: 'Stabilize Upload Documents',
      problem: '31% of sessions retry Upload Documents and 12% fail submission.',
      suggestion: 'Enable resumable uploads, file pre-validation, and clearer progress states.',
      priority: 'critical',
      category: 'frequent_failures',
      churn_score: 0.67,
      impact_score: 88,
      metrics: { churn_rate: 0.67, usage_count: 41, failure_rate: 0.12, avg_duration_ms: 68000 },
      status: 'open',
      dedupe_key: 'bank_c:frequent_failures:upload_documents:global',
      source_data: { feature: 'Upload Documents', rule_id: 'failure_rate' },
    },
    {
      tenant_id: 'bank_a',
      title: 'Reduce KYC Friction',
      problem: 'KYC Verification is the largest avoidable friction point for Bank A.',
      suggestion: 'Reduce required fields and shift non-essential compliance prompts later in the flow.',
      priority: 'high',
      category: 'funnel_drop_off',
      churn_score: 0.39,
      impact_score: 74,
      metrics: { churn_rate: 0.39, usage_count: 18, failure_rate: 0.04, avg_duration_ms: 39000 },
      status: 'open',
      dedupe_key: 'bank_a:funnel_drop_off:kyc_verification:global',
      source_data: { feature: 'KYC Verification', rule_id: 'funnel_step_drop_off' },
    },
    {
      tenant_id: 'bank_b',
      title: 'Promote EMI Calculator Earlier',
      problem: 'EMI Calculator adoption is below target for Bank B.',
      suggestion: 'Surface EMI Calculator before document upload to increase confidence and reduce abandonment.',
      priority: 'medium',
      category: 'low_adoption',
      churn_score: 0.22,
      impact_score: 58,
      metrics: { churn_rate: 0.22, usage_count: 9, failure_rate: 0.01, avg_duration_ms: 17000 },
      status: 'open',
      dedupe_key: 'bank_b:low_adoption:emi_calculator:global',
      source_data: { feature: 'EMI Calculator', rule_id: 'strategic_low_adoption' },
    },
    {
      tenant_id: 'bank_c',
      title: 'Re-sequence eMandate Setup',
      problem: 'Users entering eMandate Setup too early are more likely to abandon the journey.',
      suggestion: 'Move eMandate Setup after approval intent is confirmed and reduce required upfront setup steps.',
      priority: 'high',
      category: 'journey_duration',
      churn_score: 0.54,
      impact_score: 76,
      metrics: { churn_rate: 0.54, usage_count: 12, failure_rate: 0.06, avg_duration_ms: 42000 },
      status: 'open',
      dedupe_key: 'bank_c:journey_duration:emandate_setup:global',
      source_data: { feature: 'eMandate Setup', rule_id: 'path_duration_churn' },
    },
  ]);

  console.log('Hackathon demo seed complete');
  console.log('Demo users: ops@banka.com, ops@bankb.com, ops@bankc.com');
  console.log('Password: Demo@1234');
}

module.exports = { seed };

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
