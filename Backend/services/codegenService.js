'use strict';

/**
 * Replicates ML/ingestion/codegen/track_*.py output in pure Node.js.
 * No Python subprocess needed — the templates are just string interpolation.
 */

function generateJS(features, tenantId) {
  const featuresStr = features.map(f => `"${f}"`).join(', ');
  return `import AnalyticsTracker from "@finspark/analytics-web-sdk";

AnalyticsTracker.init({
  tenantId: "${tenantId}",
  deploymentType: "cloud",
  endpoint: "/api/events"
});

// Supported Features: [${featuresStr}]
AnalyticsTracker.trackFeature({
  tenant_id: "${tenantId}",
  l1_domain: "Loan Management",
  l2_module: "Loan Application",
  l3_feature: "${features[0] || 'Upload Documents'}",
  l4_action: "open",
  l5_deployment_node: window.location.hostname,
  metadata: { page: window.location.pathname }
});
`;
}

function generateKotlin(features, tenantId) {
  const featuresStr = features.map(f => `"${f}"`).join(', ');
  return `import com.finspark.tracking.AnalyticsTracker;

// Supported Features: [${featuresStr}]
AnalyticsTracker.init(getApplicationContext(), "${tenantId}", "cloud", "https://your-backend.com/api/events");

AnalyticsTracker.trackFeature(
    getApplicationContext(),
    "Loan Management",
    "Loan Application",
    "${features[0] || 'Upload Documents'}",
    "open"
);
`;
}

function generateDart(features, tenantId) {
  const featuresStr = features.map(f => `'${f}'`).join(', ');
  return `// Auto-generated Dart/Flutter Tracker for Finspark Intelligence
// Supported Features: [${featuresStr}]

import 'dart:convert';
import 'dart:crypto';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

class FinsparkTracker {
  static const String _tenantId = '${tenantId}';
  static final String _sessionId = const Uuid().v4();
  static const String _endpoint = 'https://your-backend.com/api/track';

  static final List<Map<String, dynamic>> _queue = [];

  static Future<String> _hashUserId() async {
    final prefs = await SharedPreferences.getInstance();
    final uid = prefs.getString('user_id') ?? 'anonymous';
    final bytes = utf8.encode(uid);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  static Future<void> track(
    String l3Feature,
    String l4Action, {
    Map<String, dynamic> metadata = const {},
  }) async {
    final userIdHash = await _hashUserId();
    _queue.add({
      'tenant_id': _tenantId,
      'session_id': _sessionId,
      'user_id': userIdHash,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'deployment_type': 'cloud',
      'channel': 'mobile',
      'l1_domain': 'unknown',
      'l2_module': 'unknown',
      'l3_feature': l3Feature,
      'l4_action': l4Action,
      'l5_deployment_node': 'client-device',
      'metadata': metadata,
    });
    if (_queue.length >= 10) await flush();
  }

  static Future<void> flush() async {
    if (_queue.isEmpty) return;
    final batch = List<Map<String, dynamic>>.from(_queue);
    _queue.clear();
    try {
      await http.post(
        Uri.parse(_endpoint),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(batch),
      );
    } catch (_) {
      _queue.insertAll(0, batch); // re-queue on failure
    }
  }
}

// Usage:
// await FinsparkTracker.track('${features[0] || 'feature_name'}', 'open');
// await FinsparkTracker.track('${features[0] || 'feature_name'}', 'close', metadata: {'duration_ms': 1200});
`;
}

/**
 * Generate all three SDK snippets for a tenant.
 * @param {string[]} features  Array of l3_feature strings
 * @param {string} tenantId    The tenant hash (64-char hex)
 * @returns {{ js: string, kotlin: string, dart: string }}
 */
function generateAll(features, tenantId) {
  return {
    js: generateJS(features, tenantId),
    kotlin: generateKotlin(features, tenantId),
    dart: generateDart(features, tenantId),
  };
}

module.exports = { generateJS, generateKotlin, generateDart, generateAll };
