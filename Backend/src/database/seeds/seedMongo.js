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
} = require('../models');

async function seed() {
  await connectDatabase();

  await Promise.all([
    Tenant.deleteMany({}),
    User.deleteMany({}),
    DetectedFeature.deleteMany({}),
    Recommendation.deleteMany({}),
    UsageEvent.deleteMany({}),
  ]);

  const tenants = await Tenant.insertMany([
    { tenant_key: 'bank_a', company_name: 'Bank A Lending', deployment_mode: 'cloud' },
    { tenant_key: 'bank_b', company_name: 'Bank B Finance', deployment_mode: 'onprem' },
    { tenant_key: 'bank_c', company_name: 'Bank C Credit', deployment_mode: 'cloud' },
  ]);

  const password_hash = await bcrypt.hash('Demo@1234', 10);

  await User.insertMany([
    { tenant_id: 'bank_a', email: 'ops@banka.com', password_hash, full_name: 'Bank A Ops', role: 'admin' },
    { tenant_id: 'bank_a', email: 'pm@banka.com', password_hash, full_name: 'Bank A PM', role: 'analyst' },
    { tenant_id: 'bank_a', email: 'cto@banka.com', password_hash, full_name: 'Bank A CTO', role: 'admin' },
    { tenant_id: 'bank_b', email: 'ops@bankb.com', password_hash, full_name: 'Bank B Ops', role: 'admin' },
    { tenant_id: 'bank_b', email: 'pm@bankb.com', password_hash, full_name: 'Bank B PM', role: 'analyst' },
    { tenant_id: 'bank_b', email: 'cto@bankb.com', password_hash, full_name: 'Bank B CTO', role: 'admin' },
    { tenant_id: 'bank_c', email: 'ops@bankc.com', password_hash, full_name: 'Bank C Ops', role: 'admin' },
    { tenant_id: 'bank_c', email: 'pm@bankc.com', password_hash, full_name: 'Bank C PM', role: 'analyst' },
    { tenant_id: 'bank_c', email: 'cto@bankc.com', password_hash, full_name: 'Bank C CTO', role: 'admin' },
    { tenant_id: 'bank_c', email: 'risk@bankc.com', password_hash, full_name: 'Bank C Risk', role: 'viewer' },
  ]);

  const featureTemplates = [
    ['Loan Management', 'Loan Application', 'Apply Loan'],
    ['Loan Management', 'Loan Application', 'Upload Documents'],
    ['Loan Management', 'Risk Engine', 'Credit Check'],
    ['Loan Management', 'KYC', 'KYC Verification'],
    ['Payments', 'Gateway', 'EMI Payment'],
    ['Payments', 'Gateway', 'Mandate Setup'],
    ['Retention', 'Service', 'Support Chat'],
  ];

  const featureDocs = [];
  for (const tenant of tenants) {
    for (const [l1_domain, l2_module, l3_feature] of featureTemplates) {
      featureDocs.push({
        tenant_id: tenant.tenant_key,
        name: l3_feature,
        l1_domain,
        l2_module,
        l3_feature,
        source_type: 'csv',
        confidence: 0.9,
      });
    }
  }
  await DetectedFeature.insertMany(featureDocs);

  await Recommendation.insertMany([
    {
      tenant_id: 'bank_a',
      title: 'Improve Credit Score Check',
      problem: '72% users drop here',
      suggestion: 'Move this step after Upload Documents',
      priority: 'high',
      churn_score: 0.72,
      status: 'open',
    },
    {
      tenant_id: 'bank_b',
      title: 'Simplify KYC Verification',
      problem: 'Users retry KYC too often',
      suggestion: 'Reduce required fields and show clearer validation',
      priority: 'medium',
      churn_score: 0.48,
      status: 'open',
    },
    {
      tenant_id: 'bank_c',
      title: 'Optimize EMI Payment',
      problem: 'Payment failures are increasing',
      suggestion: 'Add payment retry and backup gateway routing',
      priority: 'critical',
      churn_score: 0.81,
      status: 'open',
    },
  ]);

  const events = [];
  for (let i = 1; i <= 50; i += 1) {
    events.push({
      tenant_id: i <= 18 ? 'bank_a' : i <= 34 ? 'bank_b' : 'bank_c',
      session_id: `sess_${Math.ceil(i / 5)}`,
      user_id: `user_${Math.ceil(i / 5)}`,
      timestamp: new Date(Date.UTC(2026, 3, 1, 10, i, 0)),
      deployment_type: i % 2 === 0 ? 'cloud' : 'onprem',
      channel: i % 3 === 0 ? 'android' : 'web',
      l1_domain: 'Loan Management',
      l2_module: i % 5 === 0 ? 'Risk Engine' : 'Loan Application',
      l3_feature:
        i % 5 === 1
          ? 'Apply Loan'
          : i % 5 === 2
            ? 'Upload Documents'
            : i % 5 === 3
              ? 'Credit Check'
              : i % 5 === 4
                ? 'KYC Verification'
                : 'EMI Payment',
      l4_action: i % 5 === 0 ? 'fail' : 'submit',
      l5_deployment_node: 'frontend-web-01',
      duration_ms: 5000 + i * 200,
      success: i % 5 !== 0,
      metadata: {
        screen: 'loan_flow',
        step: i % 5,
        browser: { name: 'Chrome', version: '123' },
      },
      feedback_text: i % 10 === 0 ? 'This step feels slow' : '',
      churn_label: i % 5 === 0 ? 1 : 0,
    });
  }
  await UsageEvent.insertMany(events);

  console.log('Mongo seed complete');
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
