'use strict';

const { query } = require('../../db/client');

async function listRecommendations(tenantId) {
  const result = await query(
    `SELECT * FROM recommendations WHERE tenant_id = $1 AND dismissed = FALSE
     ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`,
    [tenantId]
  );
  return result.rows;
}

async function findRecommendationById(tenantId, id) {
  const result = await query(
    `SELECT * FROM recommendations WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, id]
  );
  return result.rows[0] || null;
}

async function createRecommendation(tenantId, recommendation) {
  const result = await query(
    `INSERT INTO recommendations
      (tenant_id, title, description, priority, category, affected_feature, metric_impact, action_type, rule_id, source_data, refreshed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     RETURNING *`,
    [
      tenantId,
      recommendation.title,
      recommendation.description,
      recommendation.priority,
      recommendation.category,
      recommendation.affected_feature,
      recommendation.metric_impact || null,
      recommendation.action_type || 'product_fix',
      recommendation.rule_id || 'AUTO',
      JSON.stringify(recommendation.source_data || {}),
    ]
  );
  return result.rows[0];
}

async function markRecommendationAsana(id, taskId, taskUrl) {
  const result = await query(
    `UPDATE recommendations
     SET asana_task_id = $2, asana_task_url = $3
     WHERE id = $1
     RETURNING *`,
    [id, taskId, taskUrl]
  );
  return result.rows[0];
}

module.exports = {
  listRecommendations,
  findRecommendationById,
  createRecommendation,
  markRecommendationAsana,
};
