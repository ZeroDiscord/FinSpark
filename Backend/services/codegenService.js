'use strict';

/**
 * Replicates ML/ingestion/codegen/track_*.py output in pure Node.js.
 * No Python subprocess needed — the templates are just string interpolation.
 */

function generateJS(features, tenantId) {
  const featuresStr = features.map(f => `"${f}"`).join(', ');
  return `// Auto-generated JS Tracker for Finspark Intelligence
// Supported Features: [${featuresStr}]
// Endpoint: replace with your actual ingest URL

(function() {
  const TENANT_ID = "${tenantId}";
  let sessionId = crypto.randomUUID();
  const ENDPOINT = "/api/track"; // update to your tracking endpoint

  let queue = [];
  let debounceTimer = null;

  async function hashUserId(userId) {
    if (!userId) userId = 'anonymous';
    const msgUint8 = new TextEncoder().encode(userId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getUserId() {
    return localStorage.getItem('user_id') || 'anonymous';
  }

  async function track(l3Feature, l4Action, metadata = {}) {
    const userIdHash = await hashUserId(getUserId());
    const event = {
      tenant_id: TENANT_ID,
      session_id: sessionId,
      user_id: userIdHash,
      timestamp: new Date().toISOString(),
      deployment_type: "cloud",
      channel: "web",
      l1_domain: "unknown",
      l2_module: "unknown",
      l3_feature: l3Feature,
      l4_action: l4Action,
      l5_deployment_node: "client-browser",
      metadata,
    };
    queue.push(event);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, 50);
  }

  function flush() {
    if (queue.length === 0) return;
    const batch = [...queue];
    queue = [];
    const blob = new Blob([JSON.stringify(batch)], { type: 'application/json' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, blob);
    } else {
      fetch(ENDPOINT, { method: 'POST', body: blob, keepalive: true }).catch(() => { queue = [...batch, ...queue]; });
    }
  }

  // SPA route tracking
  const orig = history.pushState;
  history.pushState = function() { orig.apply(this, arguments); track('navigation', 'route_change', { path: location.pathname }); };
  window.addEventListener('popstate', () => track('navigation', 'popstate', { path: location.pathname }));
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  window.FinsparkTracker = { track, flush };
})();

// Usage:
// FinsparkTracker.track('${features[0] || 'feature_name'}', 'open');
// FinsparkTracker.track('${features[0] || 'feature_name'}', 'close', { duration_ms: 1200 });
`;
}

function generateKotlin(features, tenantId) {
  const featuresStr = features.map(f => `"${f}"`).join(', ');
  return `// Auto-generated Kotlin Tracker for Finspark Intelligence
// Supported Features: [${featuresStr}]

package com.finspark.intelligence

import android.content.Context
import java.util.UUID
import java.security.MessageDigest
import org.json.JSONObject
import org.json.JSONArray
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.io.IOException
import java.time.Instant

object FeatureTracker {
    private const val TENANT_ID = "${tenantId}"
    private val SESSION_ID = UUID.randomUUID().toString()
    private const val ENDPOINT = "https://your-backend.com/api/track"

    private val queue = mutableListOf<JSONObject>()
    private val client = OkHttpClient()
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun hashUserId(ctx: Context): String {
        val prefs = ctx.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
        val uid = prefs.getString("user_id", "anonymous") ?: "anonymous"
        return MessageDigest.getInstance("SHA-256").digest(uid.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }

    fun track(ctx: Context, l3Feature: String, l4Action: String, metadata: Map<String, Any> = emptyMap()) {
        val event = JSONObject().apply {
            put("tenant_id", TENANT_ID)
            put("session_id", SESSION_ID)
            put("user_id", hashUserId(ctx))
            put("timestamp", Instant.now().toString())
            put("deployment_type", "cloud")
            put("channel", "mobile")
            put("l1_domain", "unknown")
            put("l2_module", "unknown")
            put("l3_feature", l3Feature)
            put("l4_action", l4Action)
            put("l5_deployment_node", "client-device")
            put("metadata", JSONObject(metadata))
        }
        synchronized(this) { queue.add(event) }
    }

    fun flush() {
        val batch = synchronized(this) {
            if (queue.isEmpty()) return
            JSONArray().also { arr -> queue.forEach { arr.put(it) }; queue.clear() }
        }
        client.newCall(Request.Builder().url(ENDPOINT)
            .post(batch.toString().toRequestBody(JSON_TYPE)).build())
            .enqueue(object : okhttp3.Callback {
                override fun onFailure(call: okhttp3.Call, e: IOException) {}
                override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) { response.close() }
            })
    }
}

// Usage:
// FeatureTracker.track(context, "${features[0] || 'feature_name'}", "open")
// FeatureTracker.track(context, "${features[0] || 'feature_name'}", "close", mapOf("duration_ms" to 1200))
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
