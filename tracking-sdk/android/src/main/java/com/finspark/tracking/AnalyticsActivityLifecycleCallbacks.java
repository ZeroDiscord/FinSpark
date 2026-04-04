package com.finspark.tracking;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

public class AnalyticsActivityLifecycleCallbacks implements Application.ActivityLifecycleCallbacks {
    @Override
    public void onActivityCreated(Activity activity, Bundle savedInstanceState) { }

    @Override
    public void onActivityStarted(Activity activity) { }

    @Override
    public void onActivityResumed(Activity activity) {
        AnalyticsTracker.trackActivityLifecycle(activity.getApplicationContext(), activity, true);
    }

    @Override
    public void onActivityPaused(Activity activity) {
        AnalyticsTracker.trackActivityLifecycle(activity.getApplicationContext(), activity, false);
    }

    @Override
    public void onActivityStopped(Activity activity) { }

    @Override
    public void onActivitySaveInstanceState(Activity activity, Bundle outState) { }

    @Override
    public void onActivityDestroyed(Activity activity) { }
}
