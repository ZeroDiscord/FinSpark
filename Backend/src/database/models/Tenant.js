'use strict';

const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    tenant_key: { type: String, required: true, unique: true, index: true },
    company_name: { type: String, required: true, trim: true },
    deployment_mode: {
      type: String,
      enum: ['cloud', 'onprem'],
      default: 'cloud',
      index: true,
    },
    plan: { type: String, default: 'trial' },
    ml_trained: { type: Boolean, default: false },
    trained_at: { type: Date, default: null },
    status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active', index: true },
    settings: {
      timezone: { type: String, default: 'UTC' },
      retention_days: { type: Number, default: 180 },
      dashboard_cache_ttl_seconds: { type: Number, default: 300 },
    },
  },
  { collection: 'tenants', timestamps: true }
);

tenantSchema.index({ company_name: 1 });

module.exports = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
