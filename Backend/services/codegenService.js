'use strict';

/**
 * Multi-language SDK + middleware code generation.
 * All templates are pure string interpolation — no subprocess needed.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeFeatures(features) {
  return features.map(f =>
    typeof f === 'string'
      ? { l1_domain: 'App', l2_module: 'General', l3_feature: f }
      : f
  );
}

function featureNames(features) {
  return features.map(f => (typeof f === 'string' ? f : f.l3_feature));
}

function buildJsExamples(features) {
  return features.slice(0, 3).map(f =>
    `FinSparkSDK.track({ l1_domain: "${f.l1_domain}", l2_module: "${f.l2_module}", l3_feature: "${f.l3_feature}", l4_action: "click" });`
  ).join('\n');
}

// ── Web (Browser) SDK ─────────────────────────────────────────────────────────
function generateJS(features, tenantId) {
  const norm = normalizeFeatures(features);
  const featuresStr = featureNames(norm).map(f => `"${f}"`).join(', ');
  const examples = buildJsExamples(norm);
  return `// FinSpark Analytics — Browser / Plain JS
// Include this script directly in your page or bundle it with your frontend assets.

const FinSparkSDK = (() => {
  const CONFIG = {
    tenantId: "${tenantId}",
    deploymentType: "cloud",
    endpoint: "/api/events",
    batchSize: 10,
    flushInterval: 5000,
  };

  // Supported features: [${featuresStr}]

  let sessionId = crypto.randomUUID();
  let userId    = localStorage.getItem("fs_user_id") || crypto.randomUUID();
  let queue     = [];
  let timer     = null;

  localStorage.setItem("fs_user_id", userId);

  function flush() {
    if (!queue.length) return;
    const batch = queue.splice(0, CONFIG.batchSize);
    navigator.sendBeacon
      ? navigator.sendBeacon(CONFIG.endpoint, JSON.stringify(batch))
      : fetch(CONFIG.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch), keepalive: true });
  }

  function track({ l1_domain, l2_module, l3_feature, l4_action, l5_deployment_node, duration_ms = 0, success = true, metadata = {} }) {
    queue.push({
      tenant_id: CONFIG.tenantId,
      session_id: sessionId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      deployment_type: CONFIG.deploymentType,
      channel: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "web",
      l1_domain, l2_module, l3_feature, l4_action,
      l5_deployment_node: l5_deployment_node || window.location.hostname,
      duration_ms, success, metadata,
      feedback_text: "",
      churn_label: 0,
    });
    if (queue.length >= CONFIG.batchSize) flush();
  }

  function init(overrides = {}) {
    Object.assign(CONFIG, overrides);
    timer = setInterval(flush, CONFIG.flushInterval);
    window.addEventListener("beforeunload", () => { clearInterval(timer); flush(); });
  }

  // Auto-track page views
  function trackPageView() {
    track({ l1_domain: "Navigation", l2_module: "Page", l3_feature: document.title || window.location.pathname, l4_action: "view", metadata: { url: window.location.href } });
  }

  init();
  trackPageView();
  window.addEventListener("popstate", trackPageView);

  return { init, track, flush, trackPageView };
})();

// ── Usage examples ────────────────────────────────────────────────────────────
${examples}
`;
}

// ── React SDK / Hook ──────────────────────────────────────────────────────────
function generateReact(features, tenantId) {
  const norm = normalizeFeatures(features);
  const first = norm[0] || { l1_domain: 'App', l2_module: 'General', l3_feature: 'Dashboard' };
  return `// FinSpark Analytics — React helper

import { useEffect, useRef, useCallback } from "react";

const TENANT_ID = "${tenantId}";
const ENDPOINT  = "/api/events";

export function useTracker({ deploymentType = "cloud" } = {}) {
  const sessionId = useRef(crypto.randomUUID());
  const userId    = useRef(localStorage.getItem("fs_uid") || crypto.randomUUID());
  const queue     = useRef([]);

  useEffect(() => {
    localStorage.setItem("fs_uid", userId.current);
    const timer = setInterval(flush, 5000);
    window.addEventListener("beforeunload", flush);
    return () => { clearInterval(timer); flush(); window.removeEventListener("beforeunload", flush); };
  }, []);

  function flush() {
    if (!queue.current.length) return;
    const batch = queue.current.splice(0);
    fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch) }).catch(() => null);
  }

  const track = useCallback(({ l1_domain, l2_module, l3_feature, l4_action, duration_ms = 0, success = true, metadata = {} }) => {
    queue.current.push({
      tenant_id: TENANT_ID, session_id: sessionId.current, user_id: userId.current,
      timestamp: new Date().toISOString(), deployment_type: deploymentType,
      channel: "web", l1_domain, l2_module, l3_feature, l4_action,
      l5_deployment_node: window.location.hostname, duration_ms, success, metadata,
    });
  }, [deploymentType]);

  return { track };
}

// ── Usage in a component ──────────────────────────────────────────────────────
export default function ${first.l3_feature.replace(/\s+/g, '')}Button() {
  const { track } = useTracker();

  function handleClick() {
    const t0 = Date.now();
    // ... do purchase logic ...
    track({ l1_domain: "${first.l1_domain}", l2_module: "${first.l2_module}", l3_feature: "${first.l3_feature}", l4_action: "Submit", duration_ms: Date.now() - t0, success: true });
  }

  return <button onClick={handleClick}>${first.l3_feature}</button>;
}

// ── Next.js middleware ─────────────────────────────────────────────────────────
// middleware.ts (at project root)
export function middleware(request) {
  // Inject session ID header so server components can correlate events
  const sid = request.cookies.get("fs_session")?.value ?? crypto.randomUUID();
  const response = NextResponse.next();
  response.cookies.set("fs_session", sid, { httpOnly: false, sameSite: "lax" });
  return response;
}
export const config = { matcher: ["/((?!_next|api|favicon).*)"] };
`;
}

// ── Node.js SDK ───────────────────────────────────────────────────────────────
function generateNode(features, tenantId) {
  const norm = normalizeFeatures(features);
  const first = norm[0] || { l1_domain: 'App', l2_module: 'General', l3_feature: 'upload_documents' };
  return `// FinSpark Analytics — Node.js tracking snippet
// axios is required for HTTP event delivery

const axios = require("axios");
const { randomUUID } = require("crypto");

class FinSparkTracker {
  constructor({ tenantId, deploymentType = "cloud", endpoint = "http://localhost:3001/api/events" }) {
    this.tenantId = tenantId;
    this.deploymentType = deploymentType;
    this.endpoint = endpoint;
    this.sessionId = randomUUID();
    this.queue = [];
    this._timer = setInterval(() => this.flush(), 5000);
  }

  track({ userId, l1_domain, l2_module, l3_feature, l4_action, l5_deployment_node = process.env.HOSTNAME || "server", duration_ms = 0, success = true, metadata = {} }) {
    this.queue.push({
      tenant_id: this.tenantId, session_id: this.sessionId, user_id: userId,
      timestamp: new Date().toISOString(), deployment_type: this.deploymentType,
      channel: "backend", l1_domain, l2_module, l3_feature, l4_action,
      l5_deployment_node, duration_ms, success, metadata,
    });
    if (this.queue.length >= 20) this.flush();
  }

  async flush() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0);
    try { await axios.post(this.endpoint, batch); } catch { this.queue.unshift(...batch); }
  }

  async shutdown() { clearInterval(this._timer); await this.flush(); }
}

const tracker = new FinSparkTracker({ tenantId: "${tenantId}" });

// ── Express.js middleware ──────────────────────────────────────────────────────
function finsparkMiddleware(req, res, next) {
  const t0 = Date.now();
  res.on("finish", () => {
    tracker.track({
      userId: req.user?.id || "anonymous",
      l1_domain: "API",
      l2_module: req.method,
      l3_feature: req.route?.path || req.path,
      l4_action: res.statusCode < 400 ? "success" : "error",
      l5_deployment_node: process.env.HOSTNAME,
      duration_ms: Date.now() - t0,
      success: res.statusCode < 400,
      metadata: { method: req.method, status: res.statusCode },
    });
  });
  next();
}

// ── Usage ──────────────────────────────────────────────────────────────────────
// app.use(finsparkMiddleware);

tracker.track({ userId: "user_123", l1_domain: "${first.l1_domain}", l2_module: "${first.l2_module}", l3_feature: "${first.l3_feature}", l4_action: "open", metadata: { page: "/dashboard" } });

process.on("SIGTERM", () => tracker.shutdown());
module.exports = { tracker, finsparkMiddleware };
`;
}

// ── Python tracking snippet ─────────────────────────────────────────────────────
function generatePython(features, tenantId) {
  const norm = normalizeFeatures(features);
  const first = norm[0] || { l1_domain: 'App', l2_module: 'General', l3_feature: 'upload_documents' };
  return `# FinSpark Analytics — Python tracking snippet

import threading, time, uuid, requests
from datetime import datetime, timezone
from functools import wraps

TENANT_ID = "${tenantId}"
ENDPOINT  = "http://localhost:3001/api/events"

class FinSparkTracker:
    def __init__(self, tenant_id=TENANT_ID, deployment_type="cloud", endpoint=ENDPOINT):
        self.tenant_id = tenant_id
        self.deployment_type = deployment_type
        self.endpoint = endpoint
        self.session_id = str(uuid.uuid4())
        self._queue: list[dict] = []
        self._lock = threading.Lock()
        self._timer = threading.Timer(5.0, self._flush_loop)
        self._timer.daemon = True
        self._timer.start()

    def track(self, *, user_id, l1_domain, l2_module, l3_feature, l4_action,
              l5_deployment_node="server", duration_ms=0, success=True, metadata=None):
        event = {
            "tenant_id": self.tenant_id, "session_id": self.session_id,
            "user_id": user_id, "timestamp": datetime.now(timezone.utc).isoformat(),
            "deployment_type": self.deployment_type, "channel": "backend",
            "l1_domain": l1_domain, "l2_module": l2_module, "l3_feature": l3_feature,
            "l4_action": l4_action, "l5_deployment_node": l5_deployment_node,
            "duration_ms": duration_ms, "success": success, "metadata": metadata or {},
        }
        with self._lock:
            self._queue.append(event)
            if len(self._queue) >= 20:
                self._send(self._queue.copy())
                self._queue.clear()

    def _send(self, batch):
        try:
            requests.post(self.endpoint, json=batch, timeout=5)
        except Exception:
            pass

    def _flush_loop(self):
        with self._lock:
            if self._queue:
                self._send(self._queue.copy())
                self._queue.clear()
        self._timer = threading.Timer(5.0, self._flush_loop)
        self._timer.daemon = True
        self._timer.start()

    def flush(self):
        with self._lock:
            if self._queue:
                self._send(self._queue.copy())
                self._queue.clear()

tracker = FinSparkTracker()

# ── FastAPI middleware ─────────────────────────────────────────────────────────
from fastapi import Request
import time as time_mod

async def finspark_middleware(request: Request, call_next):
    t0 = time_mod.time()
    response = await call_next(request)
    tracker.track(
        user_id=request.headers.get("x-user-id", "anonymous"),
        l1_domain="API", l2_module=request.method,
        l3_feature=request.url.path, l4_action="success" if response.status_code < 400 else "error",
        duration_ms=int((time_mod.time() - t0) * 1000),
        success=response.status_code < 400,
        metadata={"status": response.status_code},
    )
    return response

# app.middleware("http")(finspark_middleware)

# ── Decorator for function-level tracking ──────────────────────────────────────
def track_feature(l1_domain, l2_module, l3_feature, user_id="system"):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            t0 = time_mod.time()
            try:
                result = fn(*args, **kwargs)
                tracker.track(user_id=user_id, l1_domain=l1_domain, l2_module=l2_module,
                               l3_feature=l3_feature, l4_action="complete",
                               duration_ms=int((time_mod.time() - t0) * 1000), success=True)
                return result
            except Exception as e:
                tracker.track(user_id=user_id, l1_domain=l1_domain, l2_module=l2_module,
                               l3_feature=l3_feature, l4_action="error",
                               duration_ms=int((time_mod.time() - t0) * 1000), success=False,
                               metadata={"error": str(e)})
                raise
        return wrapper
    return decorator

# Usage:
# @track_feature("${first.l1_domain}", "${first.l2_module}", "${first.l3_feature}")
# def handle_feature(*args, **kwargs): ...
tracker.track(user_id="user_123", l1_domain="${first.l1_domain}", l2_module="${first.l2_module}", l3_feature="${first.l3_feature}", l4_action="view")
`;
}

// ── Go SDK ────────────────────────────────────────────────────────────────────
function generateGo(features, tenantId) {
  const norm = normalizeFeatures(features);
  const first = norm[0] || { l1_domain: 'App', l2_module: 'General', l3_feature: 'upload_documents' };
  return `// FinSpark Analytics — Go tracking snippet

package finspark

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
)

const TenantID = "${tenantId}"

type Event struct {
	TenantID           string      \`json:"tenant_id"\`
	SessionID          string      \`json:"session_id"\`
	UserID             string      \`json:"user_id"\`
	Timestamp          string      \`json:"timestamp"\`
	DeploymentType     string      \`json:"deployment_type"\`
	Channel            string      \`json:"channel"\`
	L1Domain           string      \`json:"l1_domain"\`
	L2Module           string      \`json:"l2_module"\`
	L3Feature          string      \`json:"l3_feature"\`
	L4Action           string      \`json:"l4_action"\`
	L5DeploymentNode   string      \`json:"l5_deployment_node"\`
	DurationMs         int64       \`json:"duration_ms"\`
	Success            bool        \`json:"success"\`
	Metadata           interface{} \`json:"metadata"\`
}

type Tracker struct {
	tenantID  string
	endpoint  string
	sessionID string
	mu        sync.Mutex
	queue     []Event
	ticker    *time.Ticker
	done      chan struct{}
}

func NewTracker(endpoint string) *Tracker {
	t := &Tracker{
		tenantID:  TenantID,
		endpoint:  endpoint,
		sessionID: uuid.NewString(),
		done:      make(chan struct{}),
	}
	t.ticker = time.NewTicker(5 * time.Second)
	go func() {
		for { select { case <-t.ticker.C: t.Flush(); case <-t.done: return } }
	}()
	return t
}

func (t *Tracker) Track(userID, l1, l2, l3, l4 string, durationMs int64, success bool, meta interface{}) {
	hostname, _ := os.Hostname()
	e := Event{
		TenantID: t.tenantID, SessionID: t.sessionID, UserID: userID,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		DeploymentType: "cloud", Channel: "backend",
		L1Domain: l1, L2Module: l2, L3Feature: l3, L4Action: l4,
		L5DeploymentNode: hostname, DurationMs: durationMs, Success: success, Metadata: meta,
	}
	t.mu.Lock()
	t.queue = append(t.queue, e)
	flush := len(t.queue) >= 20
	t.mu.Unlock()
	if flush { t.Flush() }
}

func (t *Tracker) Flush() {
	t.mu.Lock()
	if len(t.queue) == 0 { t.mu.Unlock(); return }
	batch := t.queue; t.queue = nil
	t.mu.Unlock()
	data, _ := json.Marshal(batch)
	http.Post(t.endpoint, "application/json", bytes.NewReader(data)) //nolint
}

func (t *Tracker) Shutdown() { t.ticker.Stop(); close(t.done); t.Flush() }

// ── Go Fiber middleware ───────────────────────────────────────────────────────
// import "github.com/gofiber/fiber/v2"
//
// func FinSparkMiddleware(tr *Tracker) fiber.Handler {
//   return func(c *fiber.Ctx) error {
//     t0 := time.Now()
//     err := c.Next()
//     status := c.Response().StatusCode()
//     tr.Track(c.Get("X-User-ID", "anonymous"), "API", c.Method(), c.Path(),
//       map[bool]string{true:"success",false:"error"}[status < 400],
//       time.Since(t0).Milliseconds(), status < 400,
//       map[string]interface{}{"status": status})
//     return err
//   }
// }
//
// app.Use(FinSparkMiddleware(tracker))

// ── Example usage ─────────────────────────────────────────────────────────────
// tracker := finspark.NewTracker("http://localhost:3001/api/events")
// defer tracker.Shutdown()
// tracker.Track("user_123", "${first.l1_domain}", "${first.l2_module}", "${first.l3_feature}", "open", 0, true, nil)
`;
}

// ── Java SDK ──────────────────────────────────────────────────────────────────
function generateJava(features, tenantId) {
  const norm = normalizeFeatures(features);
  const first = norm[0] || { l1_domain: 'App', l2_module: 'General', l3_feature: 'UploadDocuments' };
  return `// FinSpark Analytics — Java SDK
// Maven: <dependency>io.finspark / analytics-java / 1.0.0</dependency>

package io.finspark.sdk;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

public class FinSparkTracker {
    private static final String TENANT_ID = "${tenantId}";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final String endpoint;
    private final String sessionId;
    private final List<Map<String, Object>> queue = Collections.synchronizedList(new ArrayList<>());
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final HttpClient http = HttpClient.newHttpClient();

    public FinSparkTracker(String endpoint) {
        this.endpoint = endpoint;
        this.sessionId = UUID.randomUUID().toString();
        scheduler.scheduleAtFixedRate(this::flush, 5, 5, TimeUnit.SECONDS);
    }

    public void track(String userId, String l1, String l2, String l3, String l4,
                      long durationMs, boolean success, Map<String, Object> metadata) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("tenant_id", TENANT_ID);
        event.put("session_id", sessionId);
        event.put("user_id", userId);
        event.put("timestamp", Instant.now().toString());
        event.put("deployment_type", "cloud");
        event.put("channel", "backend");
        event.put("l1_domain", l1);
        event.put("l2_module", l2);
        event.put("l3_feature", l3);
        event.put("l4_action", l4);
        event.put("l5_deployment_node", System.getenv().getOrDefault("HOSTNAME", "server"));
        event.put("duration_ms", durationMs);
        event.put("success", success);
        event.put("metadata", metadata != null ? metadata : Map.of());
        queue.add(event);
        if (queue.size() >= 20) flush();
    }

    public synchronized void flush() {
        if (queue.isEmpty()) return;
        List<Map<String, Object>> batch = new ArrayList<>(queue);
        queue.clear();
        try {
            String body = MAPPER.writeValueAsString(batch);
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
            http.sendAsync(req, HttpResponse.BodyHandlers.discarding());
        } catch (Exception e) {
            queue.addAll(batch); // re-queue on failure
        }
    }

    public void shutdown() { scheduler.shutdown(); flush(); }
}

// ── Spring Boot filter (middleware) ──────────────────────────────────────────
// @Component
// public class FinSparkFilter implements Filter {
//     @Autowired FinSparkTracker tracker;
//
//     public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws ... {
//         long t0 = System.currentTimeMillis();
//         chain.doFilter(req, res);
//         int status = ((HttpServletResponse) res).getStatus();
//         HttpServletRequest hReq = (HttpServletRequest) req;
//         tracker.track(hReq.getHeader("X-User-ID"), "API", hReq.getMethod(),
//             hReq.getRequestURI(), status < 400 ? "success" : "error",
//             System.currentTimeMillis() - t0, status < 400, null);
//     }
// }

// ── Usage ─────────────────────────────────────────────────────────────────────
// FinSparkTracker tracker = new FinSparkTracker("http://localhost:3001/api/events");
// tracker.track("user_123", "${first.l1_domain}", "${first.l2_module}", "${first.l3_feature}", "open", 0, true, null);
// Runtime.getRuntime().addShutdownHook(new Thread(tracker::shutdown));
`;
}

// ── Kotlin / Android SDK (existing, extended) ─────────────────────────────────
function generateKotlin(features, tenantId) {
  const norm = normalizeFeatures(features);
  const first = norm[0] || { l1_domain: 'App', l2_module: 'General', l3_feature: 'Dashboard' };
  const featuresStr = featureNames(norm).map(f => `"${f}"`).join(', ');
  return `// FinSpark Analytics — Android / Kotlin SDK
// gradle: implementation("io.finspark:analytics-android:1.0.0")
// Supported Features: [${featuresStr}]

import android.content.Context
import android.os.Build
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray, org.json.JSONObject
import java.util.UUID

object FinSparkTracker {
    private const val TENANT_ID  = "${tenantId}"
    private const val ENDPOINT   = "https://your-backend.com/api/events"
    private val client           = OkHttpClient()
    private val scope            = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val queue            = mutableListOf<JSONObject>()
    private var sessionId        = UUID.randomUUID().toString()
    private var userId           = ""

    fun init(context: Context, userId: String) {
        this.userId = userId
        scope.launch {
            while (true) { delay(5_000); flush() }
        }
        Runtime.getRuntime().addShutdownHook(Thread { runBlocking { flush() } })
    }

    fun trackFeature(l1: String, l2: String, l3: String, l4: String, durationMs: Long = 0, success: Boolean = true, metadata: Map<String, Any> = emptyMap()) {
        val event = JSONObject().apply {
            put("tenant_id",          TENANT_ID)
            put("session_id",         sessionId)
            put("user_id",            userId)
            put("timestamp",          java.time.Instant.now().toString())
            put("deployment_type",    "cloud")
            put("channel",            "mobile")
            put("l1_domain",          l1)
            put("l2_module",          l2)
            put("l3_feature",         l3)
            put("l4_action",          l4)
            put("l5_deployment_node", Build.MODEL)
            put("duration_ms",        durationMs)
            put("success",            success)
            put("metadata",           JSONObject(metadata))
        }
        synchronized(queue) { queue.add(event); if (queue.size >= 20) scope.launch { flush() } }
    }

    private suspend fun flush() = withContext(Dispatchers.IO) {
        val batch = synchronized(queue) { if (queue.isEmpty()) return@withContext; val b = JSONArray(queue.toList()); queue.clear(); b }
        val body = batch.toString().toRequestBody("application/json".toMediaType())
        runCatching { client.newCall(Request.Builder().url(ENDPOINT).post(body).build()).execute().close() }
    }
}

// Usage:
// FinSparkTracker.init(applicationContext, userId = "user_123")
// FinSparkTracker.trackFeature("${first.l1_domain}", "${first.l2_module}", "${first.l3_feature}", "Submit", durationMs = 1450)
`;
}

// ── Dart / Flutter SDK (existing, kept) ──────────────────────────────────────
function generateDart(features, tenantId) {
  const norm = normalizeFeatures(features);
  const first = norm[0] || { l1_domain: 'App', l2_module: 'General', l3_feature: 'Dashboard' };
  const featuresStr = featureNames(norm).map(f => `'${f}'`).join(', ');
  return `// FinSpark Analytics — Dart / Flutter SDK
// Supported Features: [${featuresStr}]

import 'dart:convert';
import 'dart:math';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

class FinSparkTracker {
  static const String _tenantId = '${tenantId}';
  static const String _endpoint = 'https://your-backend.com/api/events';
  static final String _sessionId = const Uuid().v4();
  static final List<Map<String, dynamic>> _queue = [];
  static String _userId = 'anonymous';

  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _userId = prefs.getString('fs_uid') ?? const Uuid().v4();
    await prefs.setString('fs_uid', _userId);
    // periodic flush every 5 s
    Stream.periodic(const Duration(seconds: 5)).listen((_) => flush());
  }

  static void track(String l3Feature, String l4Action, {
    String l1Domain = 'unknown', String l2Module = 'unknown',
    int durationMs = 0, bool success = true, Map<String, dynamic> metadata = const {},
  }) {
    _queue.add({
      'tenant_id': _tenantId, 'session_id': _sessionId, 'user_id': _userId,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'deployment_type': 'cloud', 'channel': 'mobile',
      'l1_domain': l1Domain, 'l2_module': l2Module,
      'l3_feature': l3Feature, 'l4_action': l4Action,
      'l5_deployment_node': 'client-device',
      'duration_ms': durationMs, 'success': success, 'metadata': metadata,
    });
    if (_queue.length >= 20) flush();
  }

  static Future<void> flush() async {
    if (_queue.isEmpty) return;
    final batch = List<Map<String, dynamic>>.from(_queue);
    _queue.clear();
    try {
      await http.post(Uri.parse(_endpoint),
        headers: {'Content-Type': 'application/json'}, body: jsonEncode(batch));
    } catch (_) {
      _queue.insertAll(0, batch);
    }
  }
}

// Usage:
// await FinSparkTracker.init();
// FinSparkTracker.track('${first.l3_feature}', 'Submit', l1Domain: '${first.l1_domain}', l2Module: '${first.l2_module}', durationMs: 1200);
`;
}

function generateAll(features, tenantId) {
  return {
    js:     generateJS(features, tenantId),
    react:  generateReact(features, tenantId),
    node:   generateNode(features, tenantId),
    python: generatePython(features, tenantId),
    go:     generateGo(features, tenantId),
    java:   generateJava(features, tenantId),
    kotlin: generateKotlin(features, tenantId),
    dart:   generateDart(features, tenantId),
  };
}

module.exports = { generateJS, generateReact, generateNode, generatePython, generateGo, generateJava, generateKotlin, generateDart, generateAll };
