const SENSITIVE_KEYS = ['password', 'passcode', 'pan', 'aadhaar', 'ssn', 'card_number', 'cvv', 'account_number']

function maskValue(value) {
  const text = String(value ?? '')
  if (/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(text)) return `****-****-****-${text.slice(-4)}`
  if (/^\d{12}$/.test(text)) return `********${text.slice(-4)}`
  if (text.length > 8) return `${text.slice(0, 2)}****${text.slice(-2)}`
  return '****'
}

export function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object') return {}
  const output = Array.isArray(input) ? [] : {}

  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase()
    if (SENSITIVE_KEYS.some((item) => lower.includes(item))) {
      output[key] = typeof value === 'string' ? maskValue(value) : '[REDACTED]'
      continue
    }

    if (value && typeof value === 'object') {
      output[key] = sanitizeMetadata(value)
      continue
    }

    output[key] = value
  }

  return output
}
