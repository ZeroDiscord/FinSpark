# Tracking SDK

## Web

```javascript
import AnalyticsTracker from "./web/src/index.js";

AnalyticsTracker.init({
  tenantId: "bank_a",
  deploymentType: "cloud",
  endpoint: "http://localhost:3001/api/events",
});

AnalyticsTracker.trackFeature({
  l1_domain: "Loan Management",
  l2_module: "Loan Application",
  l3_feature: "Upload Documents",
  l4_action: "open",
  metadata: { page: "/upload-documents" }
});
```

React helper:

```javascript
import { useLocation } from "react-router-dom";
import { useAnalyticsPageTracking } from "./web/src/react.js";

function AppPage() {
  const location = useLocation();
  useAnalyticsPageTracking({ pathname: location.pathname });
  return null;
}
```

## Android

```java
AnalyticsTracker.init(getApplicationContext(), "bank_a", "cloud", "http://10.0.2.2:3001/api/events");
```

Auto-track activities from your `Application`:

```java
public class MainApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        AnalyticsTracker.init(getApplicationContext(), "bank_a", "cloud", "http://10.0.2.2:3001/api/events");
        registerActivityLifecycleCallbacks(new AnalyticsActivityLifecycleCallbacks());
    }
}
```

Folder structure:

```text
tracking-sdk/
  README.md
  web/
    package.json
    src/
      index.js
      queue.js
      sanitizer.js
      session.js
      react.js
  android/
    src/
      main/
        java/
          com/
            finspark/
              tracking/
                AnalyticsConfig.java
                AnalyticsTracker.java
                AnalyticsActivityLifecycleCallbacks.java
                EventQueue.java
                SessionManager.java
```
