package com.finspark.tracking;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.UUID;

public class SessionManager {
    private static final String PREFS = "finspark_sdk";
    private static final String KEY_SESSION_ID = "session_id";
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_LAST_ACTIVITY = "last_activity";
    private static final long SESSION_TIMEOUT_MS = 30 * 60 * 1000;

    public static String getOrCreateSessionId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long lastActivity = prefs.getLong(KEY_LAST_ACTIVITY, 0);
        String existing = prefs.getString(KEY_SESSION_ID, null);

        if (existing != null && now - lastActivity < SESSION_TIMEOUT_MS) {
            prefs.edit().putLong(KEY_LAST_ACTIVITY, now).apply();
            return existing;
        }

        String created = "sess_" + UUID.randomUUID();
        prefs.edit().putString(KEY_SESSION_ID, created).putLong(KEY_LAST_ACTIVITY, now).apply();
        return created;
    }

    public static String getOrCreateUserId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String existing = prefs.getString(KEY_USER_ID, null);
        if (existing != null) return existing;
        String created = "usr_" + UUID.randomUUID();
        prefs.edit().putString(KEY_USER_ID, created).apply();
        return created;
    }
}
