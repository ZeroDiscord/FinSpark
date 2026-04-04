import {
  dismissRecommendation as dismissApi,
  getRecommendations,
} from '../api/recommendations.api.js'
import { createTask } from '../api/asana.api.js'

export async function fetchRecommendations(tenantId, params) {
  return getRecommendations(tenantId, params)
}

export async function dismissRecommendation(tenantId, recommendationId) {
  return dismissApi(tenantId, recommendationId)
}

export async function sendRecommendationToKanban({ recommendationId, projectId }) {
  return createTask(recommendationId, projectId)
}
