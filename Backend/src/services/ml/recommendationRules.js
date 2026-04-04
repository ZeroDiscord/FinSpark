'use strict';

const { Recommendation } = require('../../database/models');

const RULES = [
  {
    id: 'high_churn_session',
    when: ({ prediction }) => prediction.churn_probability >= 0.85,
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: `Critical churn risk in ${prediction.drop_off_feature || session.drop_off_feature || 'journey'}`,
      problem: `Predicted churn probability is ${Math.round(prediction.churn_probability * 100)}% for session ${session.session_id}.`,
      suggestion: `Review ${prediction.drop_off_feature || session.drop_off_feature || 'the final step'} immediately and simplify the flow.`,
      priority: 'critical',
      churn_score: prediction.churn_probability,
      impact_score: prediction.churn_probability,
      source_data: { rule_id: 'high_churn_session', session_id: session.session_id, prediction },
    }),
  },
  {
    id: 'high_drop_off_feature',
    when: ({ prediction }) => Boolean(prediction.drop_off_feature),
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: `Improve ${prediction.drop_off_feature}`,
      problem: `${prediction.drop_off_feature} is the predicted drop-off point.`,
      suggestion: `Reduce friction around ${prediction.drop_off_feature} and add progress cues before the step.`,
      priority: prediction.churn_probability >= 0.7 ? 'high' : 'medium',
      churn_score: prediction.churn_probability,
      impact_score: Math.min(0.99, (prediction.churn_probability || 0) + 0.05),
      source_data: { rule_id: 'high_drop_off_feature', session_id: session.session_id, prediction },
    }),
  },
  {
    id: 'too_many_failures',
    when: ({ session }) => session.failure_count >= 2,
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: `Reduce repeated failures in ${session.drop_off_feature || 'user journey'}`,
      problem: `Session recorded ${session.failure_count} failed actions.`,
      suggestion: 'Improve validation messages, fallback handling, and retry UX.',
      priority: 'high',
      churn_score: prediction.churn_probability,
      impact_score: 0.8,
      source_data: { rule_id: 'too_many_failures', session_id: session.session_id, failure_count: session.failure_count },
    }),
  },
  {
    id: 'long_session_duration',
    when: ({ session }) => session.session_length_ms >= 10 * 60 * 1000,
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: 'Shorten long-running session flow',
      problem: `Session lasted ${Math.round(session.session_length_ms / 1000)} seconds.`,
      suggestion: 'Break the flow into smaller steps and remove non-essential fields.',
      priority: 'medium',
      churn_score: prediction.churn_probability,
      impact_score: 0.65,
      source_data: { rule_id: 'long_session_duration', session_id: session.session_id },
    }),
  },
  {
    id: 'high_retry_count',
    when: ({ session }) => session.retry_count >= 2,
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: `Users are retrying ${session.drop_off_feature || 'a step'} too often`,
      problem: `Detected ${session.retry_count} repeated feature attempts.`,
      suggestion: 'Add inline help, autosave, and clearer validation feedback.',
      priority: 'high',
      churn_score: prediction.churn_probability,
      impact_score: 0.78,
      source_data: { rule_id: 'high_retry_count', session_id: session.session_id },
    }),
  },
  {
    id: 'credit_check_risk',
    when: ({ prediction }) => /credit/i.test(prediction.drop_off_feature || ''),
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: 'Re-sequence Credit Score Check',
      problem: 'Credit Score Check appears to be causing abandonment.',
      suggestion: 'Move the credit step after document completion or prefill bureau inputs.',
      priority: 'high',
      churn_score: prediction.churn_probability,
      impact_score: 0.82,
      source_data: { rule_id: 'credit_check_risk', session_id: session.session_id, prediction },
    }),
  },
  {
    id: 'document_upload_risk',
    when: ({ prediction }) => /document|upload/i.test(prediction.drop_off_feature || ''),
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: 'Simplify document upload',
      problem: 'Document upload is a predicted drop-off feature.',
      suggestion: 'Support multi-file uploads, progress indicators, and resumable upload.',
      priority: 'high',
      churn_score: prediction.churn_probability,
      impact_score: 0.8,
      source_data: { rule_id: 'document_upload_risk', session_id: session.session_id, prediction },
    }),
  },
  {
    id: 'identity_verification_risk',
    when: ({ prediction }) => /kyc|aadhaar|pan|identity/i.test(prediction.drop_off_feature || ''),
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: 'Reduce verification friction',
      problem: 'Identity verification appears to be a friction point.',
      suggestion: 'Minimize repeated KYC fields and pre-validate documents before submit.',
      priority: 'medium',
      churn_score: prediction.churn_probability,
      impact_score: 0.72,
      source_data: { rule_id: 'identity_verification_risk', session_id: session.session_id, prediction },
    }),
  },
  {
    id: 'payment_step_risk',
    when: ({ prediction }) => /payment|emi|mandate|gateway/i.test(prediction.drop_off_feature || ''),
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: 'Stabilize payment step',
      problem: 'Payments or mandate setup are linked to predicted churn.',
      suggestion: 'Add gateway fallback, retry guidance, and clearer payment state messaging.',
      priority: 'high',
      churn_score: prediction.churn_probability,
      impact_score: 0.79,
      source_data: { rule_id: 'payment_step_risk', session_id: session.session_id, prediction },
    }),
  },
  {
    id: 'weekend_high_risk',
    when: ({ session, prediction }) => [0, 6].includes(session.day_of_week) && prediction.churn_probability >= 0.6,
    create: ({ session, prediction, analysisRunId }) => ({
      tenant_id: session.tenant_id,
      analysis_run_id: analysisRunId,
      title: 'Weekend journey needs support',
      problem: 'High churn session occurred during weekend traffic.',
      suggestion: 'Show proactive help or reduced-step flow on weekends.',
      priority: 'medium',
      churn_score: prediction.churn_probability,
      impact_score: 0.68,
      source_data: { rule_id: 'weekend_high_risk', session_id: session.session_id, prediction },
    }),
  },
];

async function createRecommendationsForPrediction({ session, prediction, analysisRunId }) {
  const docs = RULES.filter((rule) => rule.when({ session, prediction })).map((rule) =>
    rule.create({ session, prediction, analysisRunId })
  );

  if (!docs.length) return [];

  const created = [];
  for (const doc of docs) {
    const existing = await Recommendation.findOne({
      tenant_id: doc.tenant_id,
      title: doc.title,
      'source_data.session_id': doc.source_data.session_id,
      status: { $in: ['open', 'sent'] },
    });

    if (existing) {
      created.push(existing);
      continue;
    }

    created.push(await Recommendation.create(doc));
  }

  return created;
}

module.exports = {
  RULES,
  createRecommendationsForPrediction,
};
