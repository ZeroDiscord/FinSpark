# Architecture

## Non-Technical Version
```text
Detect product features -> Track how users use them -> Predict where users drop off
-> Recommend fixes -> Send actions to product teams -> Export to BI tools
```

## Technical Version
```text
APK / Website Input
  -> Feature Detection
  -> Feature Hierarchy
  -> Tracking SDK
  -> Usage Events
  -> Processed Sessions
  -> ML Predictions (churn_probability, drop_off_feature)
  -> Analytics + Recommendation Engine
  -> Asana Task Push / Power BI Export
```

## Core Services
- `Frontend`: product intelligence dashboard and integration UI
- `Backend`: auth, tenant isolation, ingestion, analytics, integrations
- `ML`: training, prediction, friction modeling, attribution
- `tracking-sdk`: browser and Android usage tracking

## Multi-Tenant Model
- All events, sessions, predictions, and recommendations are scoped by `tenant_id`
- Each tenant can connect its own Asana workspace and export its own Power BI data
- Dashboard filters support tenant-specific analytics while preserving data isolation
