'use strict';

const { getDashboardData } = require('./dashboardService');
const { createRecommendation, findRecommendationById, listRecommendations, markRecommendationAsana } = require('../models/RecommendationModel');
const legacyAsanaService = require('../../services/asanaService');
const { AsanaConnectionMissingError, NotFoundError } = require('../utils/errors');

function buildRecommendationsFromDashboard(dashboard) {
  return dashboard.top_drop_off_features.slice(0, 5).map((item) => ({
    title: `Improve ${item.feature}`,
    description: `${Math.round(item.drop_off_rate * 100)}% users drop at ${item.feature}`,
    priority: item.drop_off_rate >= 0.7 ? 'high' : item.drop_off_rate >= 0.4 ? 'medium' : 'low',
    category: 'feature_friction',
    affected_feature: item.feature,
    metric_impact: `${Math.round(item.drop_off_rate * 100)}% drop-off`,
    action_type: 'ux_flow_update',
    source_data: item,
    feature: item.feature,
    problem: `${Math.round(item.drop_off_rate * 100)}% users drop here`,
    suggestion: `Move ${item.feature} later in the flow or simplify the step to reduce abandonment.`,
  }));
}

async function getOrCreateRecommendations(tenant) {
  const existing = await listRecommendations(tenant.id);
  if (existing.length) {
    return existing.map((item) => ({
      ...item,
      feature: item.affected_feature,
      problem: item.description,
      suggestion: item.description,
    }));
  }

  const dashboard = await getDashboardData({ tenantId: tenant.id });
  const generated = buildRecommendationsFromDashboard(dashboard);
  const created = [];
  for (const recommendation of generated) {
    created.push(await createRecommendation(tenant.id, recommendation));
  }
  return created.map((item) => ({
    ...item,
    feature: item.affected_feature,
    problem: item.description,
    suggestion: item.description,
  }));
}

async function sendRecommendationToAsana(tenantId, recommendationId, projectId) {
  const recommendation = await findRecommendationById(tenantId, recommendationId);
  if (!recommendation) throw new NotFoundError('Recommendation not found.');

  const connection = await legacyAsanaService.getConnection(tenantId);
  if (!connection) throw new AsanaConnectionMissingError();

  const task = await legacyAsanaService.createTask(tenantId, {
    ...recommendation,
    project_gid: projectId || connection.workspace_gid,
  });

  await markRecommendationAsana(recommendation.id, task.task_gid, task.permalink_url);
  return task;
}

module.exports = { getOrCreateRecommendations, sendRecommendationToAsana };
