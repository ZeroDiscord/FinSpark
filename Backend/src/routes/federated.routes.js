'use strict';

/**
 * Federated Analytics Routes
 *
 * Allows on-prem FinSpark agents to push pre-aggregated (anonymized) metric
 * snapshots to the central cloud hub without transmitting raw events.
 * The hub stores the aggregates under source: "onprem_sync" for dashboard
 * filtering without ever receiving PII or raw event data.
 */

const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const mongoose = require('mongoose');
const { ValidationError } = require('../utils/errors');

// Lightweight schema for federated aggregate snapshots
const federatedSnapshotSchema = new mongoose.Schema(
  {
    tenant_id:       { type: String, required: true, index: true },
    source:          { type: String, default: 'onprem_sync', index: true },
    agent_version:   { type: String, default: '1.0.0' },
    snapshot_period: { type: String, required: true }, // e.g. "2026-04-05"
    deployment_node: { type: String, default: 'onprem-default' },
    metrics: {
      total_sessions:       { type: Number, default: 0 },
      active_users:         { type: Number, default: 0 },
      churn_rate:           { type: Number, default: 0 },
      avg_session_duration_ms: { type: Number, default: 0 },
    },
    feature_counts: [
      {
        l3_feature:    String,
        usage_count:   Number,
        unique_sessions: Number,
      },
    ],
    top_drop_off_features: [
      {
        feature:        String,
        drop_off_count: Number,
      },
    ],
    received_at: { type: Date, default: Date.now },
  },
  { collection: 'federated_snapshots', timestamps: false }
);

const FederatedSnapshot =
  mongoose.models.FederatedSnapshot ||
  mongoose.model('FederatedSnapshot', federatedSnapshotSchema);

// POST /api/federated/sync
// Called by on-prem agents with a pre-aggregated, anonymized metrics payload.
// No raw events. No PII. Tenant is resolved from the JWT token.
router.post(
  '/sync',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { snapshot_period, deployment_node, metrics, feature_counts, top_drop_off_features, agent_version } =
      req.body;

    if (!snapshot_period) throw new ValidationError('snapshot_period is required (YYYY-MM-DD).');
    if (!metrics || typeof metrics !== 'object') throw new ValidationError('metrics object is required.');

    const snap = await FederatedSnapshot.create({
      tenant_id:   req.user.tenant_db_id || req.user.sub,
      source:      'onprem_sync',
      agent_version: agent_version || '1.0.0',
      snapshot_period,
      deployment_node: deployment_node || 'onprem-default',
      metrics: {
        total_sessions:          Number(metrics.total_sessions || 0),
        active_users:            Number(metrics.active_users || 0),
        churn_rate:              Number(metrics.churn_rate || 0),
        avg_session_duration_ms: Number(metrics.avg_session_duration_ms || 0),
      },
      feature_counts:        Array.isArray(feature_counts) ? feature_counts : [],
      top_drop_off_features: Array.isArray(top_drop_off_features) ? top_drop_off_features : [],
    });

    return res.status(201).json({ accepted: true, snapshot_id: snap._id });
  })
);

// GET /api/federated/snapshots
// Returns all on-prem snapshots for the authenticated tenant (admin/analyst only).
router.get(
  '/snapshots',
  requireAuth,
  requireRole('admin', 'analyst'),
  asyncHandler(async (req, res) => {
    const tenantId = req.user.tenant_db_id || req.user.sub;
    const snapshots = await FederatedSnapshot.find({ tenant_id: tenantId })
      .sort({ received_at: -1 })
      .limit(90)
      .lean();
    return res.json({ snapshots });
  })
);

module.exports = router;
