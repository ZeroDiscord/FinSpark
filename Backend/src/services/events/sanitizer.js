'use strict';

const SENSITIVE_KEYS = [
  'password',
  'passcode',
  'pan',
  'aadhaar',
  'ssn',
  'social_security',
  'cvv',
  'card_number',
  'account_number',
];

function maskString(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(text)) {
    return `****-****-****-${text.slice(-4)}`;
  }
  if (/^\d{12}$/.test(text)) {
    return `********${text.slice(-4)}`;
  }
  if (text.length > 8) {
    return `${text.slice(0, 2)}****${text.slice(-2)}`;
  }
  return '****';
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};

  const output = Array.isArray(metadata) ? [] : {};

  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive))) {
      output[key] = typeof value === 'string' ? maskString(value) : '[REDACTED]';
      continue;
    }

    if (value && typeof value === 'object') {
      output[key] = sanitizeMetadata(value);
      continue;
    }

    if (typeof value === 'string' && /\b\d{12}\b/.test(value)) {
      output[key] = value.replace(/\b(\d{8})(\d{4})\b/g, '********$2');
      continue;
    }

    output[key] = value;
  }

  return output;
}

module.exports = { sanitizeMetadata };
