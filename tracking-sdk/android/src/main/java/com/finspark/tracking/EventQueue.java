package com.finspark.tracking;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class EventQueue {
    private static final String PREFS = "finspark_sdk";
    private static final String KEY_QUEUE = "event_queue";

    public static synchronized void enqueue(Context context, JSONObject event) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray current = load(context);
        current.put(event);
        prefs.edit().putString(KEY_QUEUE, current.toString()).apply();
    }

    public static synchronized JSONArray load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_QUEUE, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public static synchronized void replace(Context context, JSONArray queue) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_QUEUE, queue.toString()).apply();
    }
}
