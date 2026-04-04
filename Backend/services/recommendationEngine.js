'use strict';

/**
 * Rule-based recommendation engine.
 * Operates on top of ML output — does not replace the ML model.
 *
 * Input shape:
 * {
 *   frictionFeatures:  [{ feature, absorption_probability, drop_off_rate }]
 *   featureUsage:      [{ feature, usage_count, usage_pct, churn_rate }]
 *   churnDist:         { bins, complete_counts, churn_counts, churn_rate, total_sessions }
 *   overview:          { n_sessions, churn_rate, markov_states, ngram_vocab_size, lstm_val_auc, rag_documents }
 *   cooccurrencePairs: [{ feature_a, feature_b, pmi, cooccurrence_count }]  (optional)
 * }
 */

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function rec(ruleId, priority, category, title, description, affected_feature, metric_impact, action_type, source_data) {
  return { rule_id: ruleId, priority, category, title, description, affected_feature, metric_impact, action_type, source_data };
}

// R01 — Critical drop-off gate
function R01({ frictionFeatures }) {
  const critical = frictionFeatures.filter(f => (f.absorption_probability || f.drop_off_rate || 0) >= 0.60);
  return critical.map(f =>
    rec('R01', 'critical', 'ux_friction',
      `Critical drop-off at "${f.feature}" — immediate UX fix required`,
      `${Math.round((f.absorption_probability || f.drop_off_rate) * 100)}% of sessions absorb into a drop-off state at this feature. Users are abandoning the product at this exact step.`,
      f.feature,
      `Reduces critical drop-off (currently ${Math.round((f.absorption_probability || f.drop_off_rate) * 100)}%)`,
      'asana_task',
      { drop_off_prob: f.absorption_probability || f.drop_off_rate }
    )
  );
}

// R02 — Multiple high-friction features
function R02({ frictionFeatures }) {
  const high = frictionFeatures.filter(f => (f.absorption_probability || f.drop_off_rate || 0) >= 0.35);
  if (high.length < 3) return [];
  const modules = [...new Set(high.map(f => f.feature.split('_')[0]))];
  return [rec('R02', 'high', 'ux_friction',
    `${high.length} friction hotspots detected — UX audit recommended`,
    `Features ${high.slice(0, 3).map(f => `"${f.feature}"`).join(', ')} all show >35% drop-off rates, suggesting a systemic usability issue across multiple flows.`,
    high[0].feature,
    `Holistic UX improvement across ${high.length} features`,
    'roadmap',
    { friction_count: high.length, features: high.map(f => f.feature) }
  )];
}

// R03 — Low adoption + high churn
function R03({ featureUsage }) {
  return featureUsage
    .filter(f => f.usage_pct < 0.05 && (f.churn_rate || 0) > 0.50)
    .map(f =>
      rec('R03', 'high', 'adoption_gap',
        `"${f.feature}" has low adoption (${(f.usage_pct * 100).toFixed(1)}%) but high churn correlation`,
        `Only ${(f.usage_pct * 100).toFixed(1)}% of users touch this feature, yet ${(f.churn_rate * 100).toFixed(0)}% of those who do end up churning. This may indicate the feature is discoverable but broken or poorly designed.`,
        f.feature,
        `Investigate adoption barrier affecting ${(f.churn_rate * 100).toFixed(0)}% churn rate`,
        'ab_test',
        { usage_pct: f.usage_pct, churn_rate: f.churn_rate }
      )
    );
}

// R04 — Hidden high-value feature
function R04({ featureUsage }) {
  return featureUsage
    .filter(f => f.usage_pct < 0.08 && (f.churn_rate || 1) < 0.15)
    .slice(0, 3)
    .map(f =>
      rec('R04', 'medium', 'adoption_gap',
        `"${f.feature}" is underused but highly effective — boost discoverability`,
        `Users who reach "${f.feature}" have only a ${(f.churn_rate * 100).toFixed(0)}% churn rate (well below average), but only ${(f.usage_pct * 100).toFixed(1)}% discover it. Surface this feature more prominently.`,
        f.feature,
        `Could reduce churn for up to ${(100 - f.usage_pct * 100).toFixed(0)}% more users`,
        'roadmap',
        { usage_pct: f.usage_pct, churn_rate: f.churn_rate }
      )
    );
}

// R05 — Feature churn > 2x tenant baseline
function R05({ featureUsage, overview }) {
  const baseline = overview.churn_rate || 0;
  return featureUsage
    .filter(f => (f.churn_rate || 0) > baseline * 2.0 && f.usage_count > 5)
    .slice(0, 5)
    .map(f =>
      rec('R05', 'high', 'churn_risk',
        `"${f.feature}" churn rate is ${(f.churn_rate / baseline).toFixed(1)}x the tenant baseline`,
        `The baseline churn rate is ${(baseline * 100).toFixed(0)}%, but sessions involving "${f.feature}" churn at ${(f.churn_rate * 100).toFixed(0)}%. Deep-dive into session recordings at this feature.`,
        f.feature,
        `Reducing to baseline could save ${Math.round((f.churn_rate - baseline) * f.usage_count)} sessions`,
        'asana_task',
        { feature_churn: f.churn_rate, baseline_churn: baseline }
      )
    );
}

// R06 — Low LSTM AUC
function R06({ overview }) {
  if ((overview.lstm_val_auc || 1) >= 0.70) return [];
  return [rec('R06', 'medium', 'churn_risk',
    `ML prediction confidence is low (LSTM AUC: ${(overview.lstm_val_auc || 0).toFixed(3)})`,
    `The LSTM churn model has AUC ${(overview.lstm_val_auc || 0).toFixed(3)}, below the 0.70 reliability threshold. Upload more labeled session data and retrain from Settings to improve prediction accuracy.`,
    null,
    'Upload more data + retrain to raise AUC above 0.70',
    'alert',
    { lstm_val_auc: overview.lstm_val_auc }
  )];
}

// R07 — High overall churn rate
function R07({ overview }) {
  if ((overview.churn_rate || 0) <= 0.40) return [];
  return [rec('R07', 'critical', 'churn_risk',
    `Tenant-wide churn rate exceeds 40% (${(overview.churn_rate * 100).toFixed(0)}%) — systemic issue`,
    `With ${(overview.churn_rate * 100).toFixed(0)}% of sessions resulting in churn, this is a systemic product problem, not an isolated feature issue. Review all critical-friction features together and consider a full journey remap.`,
    null,
    `Reducing churn to industry average (20%) could double active user base`,
    'roadmap',
    { churn_rate: overview.churn_rate }
  )];
}

// R08 — Insufficient session volume
function R08({ overview }) {
  if ((overview.n_sessions || 0) >= 100) return [];
  return [rec('R08', 'medium', 'churn_risk',
    `Insufficient session data (${overview.n_sessions || 0} sessions) — predictions may be unreliable`,
    `The ML models are trained on only ${overview.n_sessions || 0} sessions. Reliable churn predictions require at least 500 sessions. Integrate the tracking SDK and collect more data before acting on predictions.`,
    null,
    'Integrate tracking SDK to collect 500+ sessions',
    'alert',
    { n_sessions: overview.n_sessions }
  )];
}

// R09 — Co-occurrence opportunity
function R09({ cooccurrencePairs = [], featureUsage }) {
  const usageMap = Object.fromEntries((featureUsage || []).map(f => [f.feature, f.usage_pct]));
  return cooccurrencePairs
    .filter(p => p.pmi > 1.5 &&
      (usageMap[p.feature_a] || 0) > 0.3 &&
      (usageMap[p.feature_b] || 0) < 0.1)
    .slice(0, 3)
    .map(p =>
      rec('R09', 'medium', 'cooccurrence',
        `Users who use "${p.feature_a}" rarely discover "${p.feature_b}" — cross-promote`,
        `High co-occurrence signal (PMI: ${p.pmi.toFixed(2)}) shows these features are naturally related, but "${p.feature_b}" has only ${((usageMap[p.feature_b] || 0) * 100).toFixed(1)}% adoption. Add a contextual link from "${p.feature_a}".`,
        p.feature_b,
        `Could increase "${p.feature_b}" adoption from ${((usageMap[p.feature_b] || 0) * 100).toFixed(1)}%`,
        'roadmap',
        { pmi: p.pmi, feature_a: p.feature_a, feature_b: p.feature_b }
      )
    );
}

// R10 — Bimodal churn distribution
function R10({ churnDist }) {
  if (!churnDist?.churn_counts || churnDist.churn_counts.length < 10) return [];
  const counts = churnDist.churn_counts;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const lowBucket = counts.slice(0, 4).reduce((a, b) => a + b, 0) / total;
  const highBucket = counts.slice(-4).reduce((a, b) => a + b, 0) / total;
  if (lowBucket < 0.20 || highBucket < 0.20) return [];
  return [rec('R10', 'high', 'churn_risk',
    'Bimodal churn pattern — two distinct user segments detected',
    `The churn probability distribution shows two peaks: ${(lowBucket * 100).toFixed(0)}% of churned sessions near 0 and ${(highBucket * 100).toFixed(0)}% near 1. This indicates two distinct user segments with opposite behaviors. Apply different retention strategies per segment.`,
    null,
    'Segmentation-based retention could improve overall churn by 15–25%',
    'ab_test',
    { low_bucket_pct: lowBucket, high_bucket_pct: highBucket }
  )];
}

// R11 — KYC friction
function R11({ frictionFeatures }) {
  const kyc = frictionFeatures.filter(f =>
    /kyc|document|verify|aadhaar|pan/.test(f.feature) &&
    (f.absorption_probability || f.drop_off_rate || 0) > 0.30
  );
  if (!kyc.length) return [];
  return [rec('R11', 'high', 'ux_friction',
    `KYC verification is a major abandonment point (${(Math.max(...kyc.map(f => f.absorption_probability || f.drop_off_rate)) * 100).toFixed(0)}% drop-off)`,
    `Identity verification steps are causing significant churn. Simplify the document upload UI, add OCR auto-fill, reduce required documents, and add progress indicators.`,
    kyc[0].feature,
    'KYC simplification can reduce drop-off by 20–40% (industry benchmark)',
    'asana_task',
    { kyc_features: kyc.map(f => f.feature) }
  )];
}

// R12 — Disbursement funnel gap
function R12({ featureUsage }) {
  const docUpload = featureUsage.find(f => /doc_upload|document_upload|upload/.test(f.feature));
  const disbursement = featureUsage.find(f => /disburs|loan_disbursement/.test(f.feature));
  if (!docUpload || !disbursement) return [];
  if (disbursement.usage_pct >= 0.30 || docUpload.usage_pct <= 0.40) return [];
  return [rec('R12', 'critical', 'ux_friction',
    `Only ${(disbursement.usage_pct * 100).toFixed(0)}% of users who upload documents reach disbursement`,
    `${(docUpload.usage_pct * 100).toFixed(0)}% of users upload documents but only ${(disbursement.usage_pct * 100).toFixed(0)}% reach disbursement. There is a hidden failure point between document submission and approval. Check for silent backend errors or unclear status communication.`,
    'disbursement',
    `Fixing funnel gap could add ${((docUpload.usage_pct - disbursement.usage_pct) * 100).toFixed(0)}% more completed loans`,
    'asana_task',
    { doc_upload_pct: docUpload.usage_pct, disbursement_pct: disbursement.usage_pct }
  )];
}

// R13 — Dead-end tail features
function R13({ featureUsage }) {
  if (!featureUsage || featureUsage.length < 5) return [];
  const sorted = [...featureUsage].sort((a, b) => a.usage_pct - b.usage_pct);
  const tail = sorted.slice(0, 5);
  if (!tail.every(f => (f.usage_pct || 0) < 0.02)) return [];
  return [rec('R13', 'low', 'engagement',
    `${tail.length} features have near-zero adoption — consider removing`,
    `Features ${tail.slice(0, 3).map(f => `"${f.feature}"`).join(', ')} each have less than 2% adoption. These may be dead-end screens that add cognitive load without providing value. Review and potentially remove them.`,
    tail[0].feature,
    'Removing dead features reduces cognitive load and maintenance cost',
    'roadmap',
    { tail_features: tail.map(f => f.feature) }
  )];
}

// R14 — Very short sessions (few Markov states)
function R14({ overview }) {
  if ((overview.markov_states || 99) >= 4) return [];
  return [rec('R14', 'medium', 'ux_friction',
    `Only ${overview.markov_states || 0} Markov states detected — users abandoning immediately`,
    `The Markov chain has only ${overview.markov_states || 0} states, indicating very short session sequences. Users are exiting after seeing only a few features. Improve landing experience and initial feature discoverability.`,
    null,
    'Extending session depth increases monetisation opportunity',
    'ab_test',
    { markov_states: overview.markov_states }
  )];
}

// R15 — No feedback signal for RAG
function R15({ overview }) {
  if ((overview.rag_documents || 0) > 10) return [];
  return [rec('R15', 'low', 'engagement',
    `No user feedback data available — RAG model running without context`,
    `Only ${overview.rag_documents || 0} feedback documents are indexed. The RAG model provides better insights when user feedback is available. Add in-app feedback prompts at high-friction features.`,
    null,
    'Feedback collection enables AI-powered root cause analysis',
    'roadmap',
    { rag_documents: overview.rag_documents }
  )];
}

// R16 — Mobile vs web churn disparity (requires DB events; approximated from featureUsage if channel not available)
function R16({ frictionFeatures }) {
  // This rule fires when there are many critical friction features (proxy for mobile issues)
  const severe = frictionFeatures.filter(f => (f.absorption_probability || f.drop_off_rate || 0) >= 0.45);
  if (severe.length < 2) return [];
  return [rec('R16', 'high', 'churn_risk',
    `Multiple high-severity friction points suggest channel-specific issues`,
    `${severe.length} features show >= 45% drop-off rates: ${severe.slice(0, 3).map(f => `"${f.feature}"`).join(', ')}. This pattern often indicates mobile-specific UX failures. Audit the mobile app flow specifically.`,
    severe[0].feature,
    'Mobile UX audit typically reduces mobile churn by 15–30%',
    'asana_task',
    { severe_features: severe.map(f => f.feature) }
  )];
}

const RULES = [R01, R02, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16];

/**
 * Generate all recommendations from ML data.
 * @param {object} mlData  The aggregated ML output object
 * @returns {Array} Sorted recommendation objects
 */
function generate(mlData) {
  const all = [];
  for (const rule of RULES) {
    try {
      const results = rule(mlData);
      if (Array.isArray(results)) all.push(...results);
      else if (results) all.push(results);
    } catch {
      // A failing rule should not block other rules
    }
  }
  return all.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
}

module.exports = { generate };
