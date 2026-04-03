from typing import List

def generate_android_tracker(features: List[str], tenant_id: str) -> str:
    """
    Generates a FeatureTracker.kt file.
    - Kotlin singleton object
    - track(feature: String, action: String, metadata: Map<String,Any>)
    - Uses OkHttp for async POST
    - WorkManager for background batched flush
    - Same payload schema as Flutter version
    """
    features_str = ", ".join([f'"{f}"' for f in features])
    
    kt_code = f"""// Auto-generated Kotlin Tracker for Finspark Intelligence
// Supported Features: [{features_str}]

package com.finspark.intelligence

import android.content.Context
import android.content.SharedPreferences
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

object FeatureTracker {{
    private const val tenantId = "{tenant_id}"
    private val sessionId = UUID.randomUUID().toString()
    private const val ENDPOINT = "https://api.example.com/track"
    
    private val queue = mutableListOf<JSONObject>()
    private val client = OkHttpClient()
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun hashUserId(context: Context): String {{
        val prefs = context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("user_id", "anonymous") ?: "anonymous"
        val bytes = userId.toByteArray()
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(bytes)
        return digest.joinToString("") {{ "%02x".format(it) }}
    }}

    fun track(context: Context, l3Feature: String, l4Action: String, metadata: Map<String, Any> = emptyMap()) {{
        val event = JSONObject().apply {{
            put("tenant_id", tenantId)
            put("session_id", sessionId)
            put("user_id", hashUserId(context))
            put("timestamp", Instant.now().toString())
            put("deployment_type", "cloud")
            put("channel", "mobile")
            put("l1_domain", "unknown")
            put("l2_module", "unknown")
            put("l3_feature", l3Feature)
            put("l4_action", l4Action)
            put("l5_deployment_node", "client-device")
            put("metadata", JSONObject(metadata))
        }}
        
        synchronized(this) {{
            queue.add(event)
        }}
    }}

    fun flush() {{
        val batch = synchronized(this) {{
            if (queue.isEmpty()) return
            val currentQueue = JSONArray()
            queue.forEach {{ currentQueue.put(it) }}
            queue.clear()
            currentQueue
        }}

        val requestBody = batch.toString().toRequestBody(JSON_MEDIA_TYPE)
        val request = Request.Builder()
            .url(ENDPOINT)
            .post(requestBody)
            .build()

        client.newCall(request).enqueue(object : okhttp3.Callback {{
            override fun onFailure(call: okhttp3.Call, e: IOException) {{
                // Re-queue on failure
                synchronized(this) {{
                    for (i in 0 until batch.length()) {{
                        queue.add(0, batch.getJSONObject(i))
                    }}
                }}
            }}
            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {{
                response.close()
            }}
        }})
    }}
}}
"""
    return kt_code
