'use strict';

const Recommendation = require('../database/models/Recommendation');

async function listRecommendations(tenantId) {
  return Recommendation.find({ tenant_id: tenantId, status: { $ne: 'dismissed' } })
    .sort({ priority: 1, created_at: -1 })
    .lean();
}

async function findRecommendationById(tenantId, id) {
  return Recommendation.findOne({ _id: id, tenant_id: tenantId }).lean();
}

async function createRecommendation(tenantId, recommendation) {
  const feature = recommendation.affected_feature || recommendation.feature || null;
  const doc = await Recommendation.create({
    tenant_id: tenantId,
    title: recommendation.title,
    problem: recommendation.problem || recommendation.description || '',
    suggestion: recommendation.suggestion || recommendation.description || '',
    priority: recommendation.priority || 'medium',
    category: recommendation.category || 'general',
    impact_score: recommendation.impact_score || null,
    metrics: recommendation.metrics || {},
    source_data: { ...(recommendation.source_data || {}), feature },
    status: 'open',
  });
  return doc.toObject();
}

async function markRecommendationAsana(id, taskId, taskUrl) {
  return Recommendation.findByIdAndUpdate(
    id,
    { $set: { asana_task_gid: taskId, asana_task_url: taskUrl, status: 'sent' } },
    { new: true }
  ).lean();
}

module.exports = {
  listRecommendations,
  findRecommendationById,
  createRecommendation,
  markRecommendationAsana,
};
