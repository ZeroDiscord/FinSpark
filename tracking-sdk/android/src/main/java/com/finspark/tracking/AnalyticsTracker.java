package com.finspark.tracking;

import android.app.Activity;
import android.content.Context;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

public class AnalyticsTracker {
    private static AnalyticsConfig config;
    private static final OkHttpClient client = new OkHttpClient();
    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final Map<String, Long> timers = new HashMap<>();

    public static void init(Context context, String tenantId, String deploymentType, String endpoint) {
        config = new AnalyticsConfig(tenantId, deploymentType, endpoint, "android");
        SessionManager.getOrCreateUserId(context);
        SessionManager.getOrCreateSessionId(context);
    }

    public static void trackFeature(Context context, String l1Domain, String l2Module, String l3Feature, String l4Action) {
        trackFeature(context, l1Domain, l2Module, l3Feature, l4Action, null, true, "");
    }

    public static void trackFeature(Context context, String l1Domain, String l2Module, String l3Feature, String l4Action, JSONObject metadata, boolean success, String feedbackText) {
        try {
            JSONObject event = new JSONObject();
            event.put("tenant_id", config.tenantId);
            event.put("session_id", SessionManager.getOrCreateSessionId(context));
            event.put("user_id", SessionManager.getOrCreateUserId(context));
            event.put("timestamp", new java.util.Date().toInstant().toString());
            event.put("deployment_type", config.deploymentType);
            event.put("channel", config.channel);
            event.put("l1_domain", l1Domain);
            event.put("l2_module", l2Module);
            event.put("l3_feature", l3Feature);
            event.put("l4_action", l4Action);
            event.put("l5_deployment_node", android.os.Build.MODEL);
            event.put("duration_ms", JSONObject.NULL);
            event.put("success", success);
            event.put("metadata", metadata == null ? new JSONObject() : metadata);
            event.put("feedback_text", feedbackText == null ? "" : feedbackText);
            event.put("churn_label", JSONObject.NULL);

            EventQueue.enqueue(context, event);
            flush(context);
        } catch (Exception ignored) {}
    }

    public static void trackScreenOpen(Context context, String screenName) {
        timers.put(screenName, System.currentTimeMillis());
        trackFeature(context, "Navigation", "Activity Tracking", screenName, "open");
    }

    public static void trackScreenClose(Context context, String screenName) {
        long startedAt = timers.containsKey(screenName) ? timers.get(screenName) : System.currentTimeMillis();
        long duration = System.currentTimeMillis() - startedAt;
        timers.remove(screenName);

        try {
          JSONObject metadata = new JSONObject();
          metadata.put("screen", screenName);
          JSONObject event = new JSONObject();
          event.put("tenant_id", config.tenantId);
          event.put("session_id", SessionManager.getOrCreateSessionId(context));
          event.put("user_id", SessionManager.getOrCreateUserId(context));
          event.put("timestamp", new java.util.Date().toInstant().toString());
          event.put("deployment_type", config.deploymentType);
          event.put("channel", config.channel);
          event.put("l1_domain", "Navigation");
          event.put("l2_module", "Activity Tracking");
          event.put("l3_feature", screenName);
          event.put("l4_action", "close");
          event.put("l5_deployment_node", android.os.Build.MODEL);
          event.put("duration_ms", duration);
          event.put("success", true);
          event.put("metadata", metadata);
          event.put("feedback_text", "");
          event.put("churn_label", JSONObject.NULL);
          EventQueue.enqueue(context, event);
          flush(context);
        } catch (Exception ignored) {}
    }

    public static void attachClickTracking(Context context, View view, String l1Domain, String l2Module, String featureName) {
        view.setOnClickListener(v -> trackFeature(context, l1Domain, l2Module, featureName, "click"));
    }

    public static void flush(Context context) {
        try {
            JSONArray queue = EventQueue.load(context);
            if (queue.length() == 0) return;

            Request request = new Request.Builder()
                .url(config.endpoint)
                .post(RequestBody.create(queue.toString(), JSON))
                .build();

            client.newCall(request).enqueue(new okhttp3.Callback() {
                @Override
                public void onFailure(okhttp3.Call call, java.io.IOException e) { }

                @Override
                public void onResponse(okhttp3.Call call, okhttp3.Response response) {
                    response.close();
                    if (response.isSuccessful()) {
                        EventQueue.replace(context, new JSONArray());
                    }
                }
            });
        } catch (Exception ignored) {}
    }

    public static void trackActivityLifecycle(Context context, Activity activity, boolean isOpen) {
        String name = activity.getClass().getSimpleName();
        if (isOpen) trackScreenOpen(context, name);
        else trackScreenClose(context, name);
    }
}
