'use strict';

/**
 * Feature Matching Layer
 * Maps raw crawler-detected feature strings to the canonical L1/L2/L3 hierarchy
 * used in tracking events.
 *
 * Strategy:
 *  1. Exact / normalized match
 *  2. Synonym table lookup
 *  3. Token-level Jaccard fuzzy match
 *  4. Trigram similarity fallback
 *
 * Returns a confidence score 0–1 and the best matching hierarchy entry.
 */

// ── Canonical feature map ─────────────────────────────────────────────────────
// Format: { key: { l1, l2, l3 } }
const CANONICAL_FEATURES = [
  { key: 'login',              l1: 'Authentication', l2: 'Auth',         l3: 'login' },
  { key: 'signup',             l1: 'Authentication', l2: 'Auth',         l3: 'signup' },
  { key: 'logout',             l1: 'Authentication', l2: 'Auth',         l3: 'logout' },
  { key: 'portfolio',          l1: 'Finance',        l2: 'Portfolio',    l3: 'portfolio_view' },
  { key: 'buy_stock',          l1: 'Finance',        l2: 'Portfolio',    l3: 'buy_stock' },
  { key: 'sell_stock',         l1: 'Finance',        l2: 'Portfolio',    l3: 'sell_stock' },
  { key: 'watchlist',          l1: 'Finance',        l2: 'Watchlist',    l3: 'watchlist' },
  { key: 'add_symbol',         l1: 'Finance',        l2: 'Watchlist',    l3: 'add_symbol' },
  { key: 'alerts',             l1: 'Finance',        l2: 'Alerts',       l3: 'price_alert' },
  { key: 'payment_gateway',    l1: 'Finance',        l2: 'Payments',     l3: 'checkout' },
  { key: 'checkout',           l1: 'Ecommerce',      l2: 'Checkout',     l3: 'checkout' },
  { key: 'coupon',             l1: 'Ecommerce',      l2: 'Checkout',     l3: 'coupon_apply' },
  { key: 'cart',               l1: 'Ecommerce',      l2: 'Cart',         l3: 'cart_view' },
  { key: 'upi',                l1: 'Banking',        l2: 'Transfers',    l3: 'upi' },
  { key: 'bank_transfer',      l1: 'Banking',        l2: 'Transfers',    l3: 'bank_transfer' },
  { key: 'loan_application',   l1: 'Loan',           l2: 'Origination',  l3: 'loan_application' },
  { key: 'income_verification',l1: 'Loan',           l2: 'Origination',  l3: 'income_verification' },
  { key: 'bureau_pull',        l1: 'Loan',           l2: 'Bureau',       l3: 'bureau_pull' },
  { key: 'credit_scoring',     l1: 'Loan',           l2: 'Bureau',       l3: 'credit_scoring' },
  { key: 'emi_calculator',     l1: 'Loan',           l2: 'Tools',        l3: 'emi_calculator' },
  { key: 'chat_support',       l1: 'Support',        l2: 'Chat',         l3: 'chat_support' },
  { key: 'ticket',             l1: 'Support',        l2: 'Helpdesk',     l3: 'ticket_create' },
  { key: 'upload_documents',   l1: 'Compliance',     l2: 'KYC',         l3: 'upload_documents' },
  { key: 'kyc',                l1: 'Compliance',     l2: 'KYC',         l3: 'kyc_verification' },
  { key: 'dashboard',          l1: 'Navigation',     l2: 'Dashboard',    l3: 'dashboard_view' },
  { key: 'settings',           l1: 'Navigation',     l2: 'Settings',     l3: 'settings_view' },
  { key: 'notifications',      l1: 'Navigation',     l2: 'Notifications',l3: 'notification_view' },
  { key: 'profile',            l1: 'Navigation',     l2: 'Profile',      l3: 'profile_view' },
  { key: 'reports',            l1: 'Analytics',      l2: 'Reports',      l3: 'report_view' },
  { key: 'export',             l1: 'Analytics',      l2: 'Export',       l3: 'data_export' },
];

// ── Synonym table: raw → canonical key ───────────────────────────────────────
const SYNONYMS = {
  // Auth
  'sign_in': 'login', 'signin': 'login', 'log_in': 'login', 'authenticate': 'login',
  'register': 'signup', 'sign_up': 'signup', 'create_account': 'signup', 'onboarding': 'signup',
  'sign_out': 'logout', 'log_out': 'logout',
  // Finance
  'stock_buy': 'buy_stock', 'purchase_stock': 'buy_stock', 'buy_shares': 'buy_stock',
  'stock_sell': 'sell_stock', 'sell_shares': 'sell_stock',
  'watch_list': 'watchlist', 'favorites': 'watchlist', 'saved_stocks': 'watchlist',
  'price_alert': 'alerts', 'alert': 'alerts', 'notification_alert': 'alerts',
  // Payments
  'payment': 'payment_gateway', 'pay': 'payment_gateway', 'billing': 'payment_gateway',
  'payment_method': 'payment_gateway', 'stripe': 'payment_gateway', 'razorpay': 'payment_gateway',
  'order': 'checkout', 'place_order': 'checkout', 'buy_now': 'checkout',
  'promo_code': 'coupon', 'discount_code': 'coupon', 'voucher': 'coupon',
  'shopping_cart': 'cart', 'basket': 'cart',
  // Banking
  'transfer': 'bank_transfer', 'wire_transfer': 'bank_transfer', 'fund_transfer': 'bank_transfer',
  'unified_payments': 'upi', 'instant_pay': 'upi',
  // Loan
  'apply_loan': 'loan_application', 'loan_apply': 'loan_application', 'credit_application': 'loan_application',
  'salary_verification': 'income_verification', 'document_verification': 'income_verification',
  'credit_report': 'bureau_pull', 'cibil': 'bureau_pull', 'equifax': 'bureau_pull',
  'credit_score': 'credit_scoring', 'fico': 'credit_scoring',
  'loan_calculator': 'emi_calculator', 'repayment_calculator': 'emi_calculator',
  // Support
  'live_chat': 'chat_support', 'helpdesk_chat': 'chat_support', 'support_chat': 'chat_support',
  'support_ticket': 'ticket', 'raise_ticket': 'ticket', 'issue_report': 'ticket',
  // KYC
  'document_upload': 'upload_documents', 'file_upload': 'upload_documents', 'kyc_upload': 'upload_documents',
  'know_your_customer': 'kyc', 'identity_verification': 'kyc', 'aadhar': 'kyc', 'pan_card': 'kyc',
  // Nav
  'home': 'dashboard', 'overview': 'dashboard', 'main_screen': 'dashboard',
  'preferences': 'settings', 'account_settings': 'settings', 'configuration': 'settings',
  'push_notification': 'notifications', 'inbox': 'notifications',
  'user_profile': 'profile', 'my_account': 'profile', 'account': 'profile',
  'analytics': 'reports', 'reporting': 'reports', 'statistics': 'reports',
  'download': 'export', 'csv_export': 'export', 'data_download': 'export',
};

// ── String normalization ──────────────────────────────────────────────────────
function normalize(str) {
  return str.toLowerCase().replace(/[-\s]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ── Trigram set ───────────────────────────────────────────────────────────────
function trigrams(str) {
  const s = `  ${str}  `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
  return set;
}

function trigramSimilarity(a, b) {
  const sa = trigrams(a);
  const sb = trigrams(b);
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  return (2 * intersection) / (sa.size + sb.size);
}

// ── Token Jaccard ─────────────────────────────────────────────────────────────
function jaccardSimilarity(a, b) {
  const tokA = new Set(a.split('_').filter(Boolean));
  const tokB = new Set(b.split('_').filter(Boolean));
  let inter = 0;
  for (const t of tokA) if (tokB.has(t)) inter++;
  return inter / (tokA.size + tokB.size - inter);
}

// ── Main matcher ──────────────────────────────────────────────────────────────
/**
 * Match a single raw feature string to the canonical hierarchy.
 * @param {string} raw
 * @returns {{ raw, canonical_key, l1_domain, l2_module, l3_feature, confidence, match_method }}
 */
function matchFeature(raw) {
  const norm = normalize(raw);

  // 1. Exact match against canonical keys
  const exactCanonical = CANONICAL_FEATURES.find(f => f.key === norm);
  if (exactCanonical) {
    return { raw, ...exactCanonical, confidence: 0.99, match_method: 'exact' };
  }

  // 2. Synonym lookup
  const synonymKey = SYNONYMS[norm];
  if (synonymKey) {
    const target = CANONICAL_FEATURES.find(f => f.key === synonymKey);
    if (target) return { raw, ...target, confidence: 0.92, match_method: 'synonym' };
  }

  // 3. Fuzzy: try each canonical key with Jaccard + trigram combo
  let bestScore = 0;
  let bestMatch = null;

  for (const canon of CANONICAL_FEATURES) {
    const jaccard  = jaccardSimilarity(norm, canon.key);
    const tg       = trigramSimilarity(norm, canon.key);
    const combined = jaccard * 0.55 + tg * 0.45;

    if (combined > bestScore) {
      bestScore = combined;
      bestMatch = canon;
    }
  }

  if (bestMatch && bestScore >= 0.35) {
    return {
      raw,
      ...bestMatch,
      confidence: Math.min(0.89, Number((bestScore * 0.9).toFixed(2))),
      match_method: 'fuzzy',
    };
  }

  // 4. Fallback — unmapped
  return {
    raw,
    canonical_key: norm,
    l1_domain: 'Unknown',
    l2_module: 'Unknown',
    l3_feature: norm,
    confidence: 0.10,
    match_method: 'fallback',
  };
}

/**
 * Match an array of crawler-detected raw features.
 * @param {string[]} rawFeatures
 * @returns {Array<ReturnType<matchFeature>>}
 */
function matchFeatures(rawFeatures) {
  return rawFeatures.map(matchFeature);
}

/**
 * Deduplicate matches (same l3_feature) keeping highest confidence.
 * @param {ReturnType<matchFeatures>} matches
 * @returns {ReturnType<matchFeatures>}
 */
function deduplicateMatches(matches) {
  const best = new Map();
  for (const m of matches) {
    const existing = best.get(m.l3_feature);
    if (!existing || m.confidence > existing.confidence) {
      best.set(m.l3_feature, m);
    }
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Full pipeline: match + deduplicate + filter by confidence threshold.
 * @param {string[]} rawFeatures  Crawler output
 * @param {number}  threshold     Minimum confidence to include (default 0.3)
 * @returns {{ matched: Array, unmatched: Array, summary: object }}
 */
function processCrawlerOutput(rawFeatures, threshold = 0.3) {
  const all = matchFeatures(rawFeatures);
  const deduped = deduplicateMatches(all);
  const matched = deduped.filter(m => m.confidence >= threshold);
  const unmatched = deduped.filter(m => m.confidence < threshold);

  return {
    matched,
    unmatched,
    summary: {
      total_input: rawFeatures.length,
      matched_count: matched.length,
      unmatched_count: unmatched.length,
      avg_confidence: matched.length
        ? Number((matched.reduce((s, m) => s + m.confidence, 0) / matched.length).toFixed(2))
        : 0,
      methods_used: [...new Set(all.map(m => m.match_method))],
    },
  };
}

module.exports = { matchFeature, matchFeatures, processCrawlerOutput, CANONICAL_FEATURES, SYNONYMS };
