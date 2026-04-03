from typing import List

def generate_flutter_tracker(features: List[str], tenant_id: str) -> str:
    """
    Generates a track.dart file as a string.
    The file must contain:
    - A FeatureTracker singleton class
    - A track(l3_feature, l4_action, {metadata}) method
    - Uses http package to POST to a configurable endpoint
    - Attaches: tenant_id (from build config), session_id (UUID generated at app start),
      user_id (from SharedPreferences, hashed), timestamp, channel="mobile"
    - Batches events locally and flushes every 30 seconds or on app lifecycle pause
    """
    features_str = ", ".join([f'"{f}"' for f in features])
    
    dart_code = f"""// Auto-generated Tracker for Finspark Intelligence
// Supported Features: [{features_str}]

import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:crypto/crypto.dart';

class FeatureTracker {{
  static final FeatureTracker _instance = FeatureTracker._internal();
  factory FeatureTracker() => _instance;
  FeatureTracker._internal();

  final String tenantId = "{tenant_id}";
  late String sessionId;
  String endpoint = "https://api.example.com/track";
  
  List<Map<String, dynamic>> _queue = [];
  Timer? _flushTimer;
  
  Future<void> init() async {{
    sessionId = const Uuid().v4();
    _flushTimer = Timer.periodic(const Duration(seconds: 30), (_) => flush());
  }}

  Future<String> _getHashedUserId() async {{
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString('user_id') ?? 'anonymous';
    final bytes = utf8.encode(userId);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }}

  Future<void> track(String l3Feature, String l4Action, {{Map<String, dynamic>? metadata}}) async {{
    final userId = await _getHashedUserId();
    
    final event = {{
      "tenant_id": tenantId,
      "session_id": sessionId,
      "user_id": userId,
      "timestamp": DateTime.now().toUtc().toIso8601String(),
      "deployment_type": "cloud",
      "channel": "mobile",
      "l1_domain": "unknown", // To be overridden
      "l2_module": "unknown", // To be overridden
      "l3_feature": l3Feature,
      "l4_action": l4Action,
      "l5_deployment_node": "client-device",
      "metadata": metadata ?? {{}}
    }};
    
    _queue.add(event);
  }}

  Future<void> flush() async {{
    if (_queue.isEmpty) return;
    
    final batch = List.from(_queue);
    _queue.clear();
    
    try {{
      await http.post(
        Uri.parse(endpoint),
        headers: {{"Content-Type": "application/json"}},
        body: jsonEncode(batch)
      );
    }} catch (e) {{
      // On failure, re-queue events
      _queue.insertAll(0, batch);
    }}
  }}
  
  // Call this on app lifecycle pause
  void onPause() {{
    flush();
  }}
}}
"""
    return dart_code
