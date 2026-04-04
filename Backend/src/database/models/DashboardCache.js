'use strict';

const mongoose = require('mongoose');

const dashboardCacheSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    cache_key: { type: String, required: true },
    date_start: Date,
    date_end: Date,
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    expires_at: { type: Date, required: true, index: true },
  },
  { collection: 'dashboard_cache', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

dashboardCacheSchema.index(
  { tenant_id: 1, cache_key: 1, date_start: 1, date_end: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.DashboardCache || mongoose.model('DashboardCache', dashboardCacheSchema);
