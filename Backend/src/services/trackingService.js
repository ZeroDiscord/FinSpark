'use strict';

const { generateJS, generateKotlin } = require('../../services/codegenService');

function generateTrackingSnippets({ platform, features, tenantId }) {
  const normalized = Array.isArray(features) ? features : [];
  return {
    platform,
    javascript_snippet: generateJS(normalized, tenantId),
    android_snippet: generateKotlin(normalized, tenantId),
  };
}

module.exports = { generateTrackingSnippets };
