'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const { query } = require('../db/client');
const mlClient = require('../services/mlClient');
const { generate } = require('../services/recommendationEngine');

async function resolveTenant(tenantParam, userId) {
  const res = await query(
    'SELECT id, tenant_hash FROM tenants WHERE id = $1 AND owner_id = $2',
    [tenantParam, userId]
  );
  return res.rows[0] || null;
}

async function fetchMlData(tenantHash) {
  const [frictionRes, usageRes, churnRes, overviewRes] = await Promise.allSettled([
    mlClient.get('/features/friction', { params: { tenant_id: tenantHash } }),
    mlClient.get('/dashboard/feature-usage', { params: { tenant_id: tenantHash } }),
    mlClient.get('/dashboard/churn-distribution', { params: { tenant_id: tenantHash } }),
    mlClient.get('/dashboard/tenants'),
  ]);

  const frictionFeatures = frictionRes.status === 'fulfilled' ? (frictionRes.value.data || []) : [];
  const featureUsage     = usageRes.status === 'fulfilled'    ? (usageRes.value.data || [])    : [];
  const churnDist        = churnRes.status === 'fulfilled'    ? (churnRes.value.data || {})    : {};

  let overview = {};
  if (overviewRes.status === 'fulfilled') {
    const tenants = Array.isArray(overviewRes.value.data) ? overviewRes.value.data : [];
    overview = tenants.find(t => t.tenant_id === tenantHash) || {};
  }

  return { frictionFeatures, featureUsage, churnDist, overview, cooccurrencePairs: [] };
}

// GET /api/recommendations/:tenantId
router.get('/:tenantId', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const { priority, limit = 20, refresh } = req.query;

    // Check if we have fresh recommendations (< 10min old) and refresh not forced
    if (!refresh) {
      let dbQuery = `SELECT * FROM recommendations WHERE tenant_id = $1 AND dismissed = FALSE
                     AND refreshed_at > NOW() - INTERVAL '10 minutes'`;
      const params = [tenant.id];
      if (priority) {
        dbQuery += ` AND priority = $${params.length + 1}`;
        params.push(priority);
      }
      dbQuery += ` ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
                  LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));

      const cached = await query(dbQuery, params);
      if (cached.rows.length > 0) return res.json(cached.rows);
    }

    // Generate fresh recommendations
    const mlData = await fetchMlData(tenant.tenant_hash);
    const recs = generate(mlData);

    // Upsert into DB
    for (const r of recs) {
      await query(
        `INSERT INTO recommendations
           (tenant_id, title, description, priority, category, affected_feature,
            metric_impact, action_type, rule_id, source_data, refreshed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT DO NOTHING`,
        [tenant.id, r.title, r.description, r.priority, r.category,
         r.affected_feature, r.metric_impact, r.action_type, r.rule_id,
         JSON.stringify(r.source_data)]
      );
    }

    // Fetch and return from DB
    let returnQuery = `SELECT * FROM recommendations WHERE tenant_id = $1 AND dismissed = FALSE`;
    const returnParams = [tenant.id];
    if (priority) {
      returnQuery += ` AND priority = $${returnParams.length + 1}`;
      returnParams.push(priority);
    }
    returnQuery += ` ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
                    LIMIT $${returnParams.length + 1}`;
    returnParams.push(parseInt(limit));

    const result = await query(returnQuery, returnParams);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/recommendations/:tenantId/:recId/dismiss
router.patch('/:tenantId/:recId/dismiss', requireAuth, async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req.params.tenantId, req.user.sub);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    await query(
      'UPDATE recommendations SET dismissed = TRUE WHERE id = $1 AND tenant_id = $2',
      [req.params.recId, tenant.id]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
