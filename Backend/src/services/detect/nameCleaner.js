'use strict';

const STOP_WORDS = new Set([
  'main', 'base', 'common', 'default', 'sample', 'demo', 'test', 'temp',
  'activity', 'fragment', 'screen', 'page', 'view', 'layout',
]);

const EXACT_REPLACEMENTS = {
  btn: '',
  button: '',
  menu: '',
  nav: '',
  tab: '',
  screen: '',
  page: '',
  lbl: '',
  txt: '',
  et: '',
  rv: '',
  iv: '',
  tv: '',
  doc: 'document',
  docs: 'documents',
  appln: 'application',
  applyln: 'apply loan',
  kyc: 'KYC',
  emi: 'EMI',
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  otp: 'OTP',
  auth: 'authentication',
  txn: 'transaction',
  disbursal: 'disbursement',
  bureau: 'credit bureau',
};

function splitCamel(value) {
  return value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

function normalizeToken(token) {
  const lower = token.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(EXACT_REPLACEMENTS, lower)) {
    return EXACT_REPLACEMENTS[lower];
  }
  return token;
}

function prettify(text) {
  return text
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      if (['KYC', 'EMI', 'PAN', 'OTP', 'API'].includes(token)) return token;
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}

function cleanFeatureName(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let value = raw
    .replace(/(Activity|Fragment|Screen|Page|View|Layout|Adapter|Holder|Controller)$/gi, '')
    .replace(/^(btn_|button_|menu_|screen_|nav_|tab_|toolbar_|title_|action_|item_|card_|form_)/i, '')
    .replace(/[@/+]/g, ' ')
    .replace(/[{}()[\]]/g, ' ')
    .replace(/[/\\]+/g, ' ')
    .replace(/[-_.]+/g, ' ');

  value = splitCamel(value)
    .replace(/\b(api|endpoint|service|repo|repository)\b/gi, ' ')
    .replace(/\b(v\d+)\b/gi, ' ')
    .replace(/\b(id|ui)\b/gi, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let tokens = value
    .split(' ')
    .map(normalizeToken)
    .join(' ')
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !STOP_WORDS.has(t.toLowerCase()))
    .filter((t) => t.length > 1 || ['KYC', 'EMI', 'PAN', 'OTP'].includes(t.toUpperCase()));

  if (!tokens.length) return null;

  const joined = tokens.join(' ')
    .replace(/\bloan apply\b/gi, 'apply loan')
    .replace(/\bdoc upload\b/gi, 'document upload')
    .replace(/\bcredit bureau score\b/gi, 'credit score')
    .replace(/\s+/g, ' ')
    .trim();

  if (!joined) return null;
  return prettify(joined);
}

module.exports = { cleanFeatureName };
