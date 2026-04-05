import {
  dismissRecommendation as dismissApi,
  getRecommendations,
} from '../api/recommendations.api.js'
import client from '../api/client.js'

export async function fetchRecommendations(tenantId, params) {
  return getRecommendations(tenantId, params)
}

export async function dismissRecommendation(tenantId, recommendationId) {
  return dismissApi(tenantId, recommendationId)
}

export async function sendRecommendationToKanban({ tenantId, recommendationId, projectId, sectionId }) {
  return client
    .post(
      `/recommendations/${recommendationId}/send-to-asana`,
      { project_id: projectId, section_id: sectionId },
      { params: { tenant_id: tenantId } }
    )
    .then((r) => r.data)
}
