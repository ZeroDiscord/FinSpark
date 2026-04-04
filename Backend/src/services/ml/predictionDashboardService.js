'use strict';

function summarizePredictions(predictions) {
  const featureMap = new Map();
  const highChurnSessions = [];

  for (const prediction of predictions) {
    const feature = prediction.drop_off_feature || 'Unknown';
    if (!featureMap.has(feature)) {
      featureMap.set(feature, {
        feature,
        prediction_count: 0,
        high_churn_count: 0,
        churn_probability_sum: 0,
      });
    }

    const item = featureMap.get(feature);
    item.prediction_count += 1;
    item.churn_probability_sum += prediction.churn_probability || 0;
    if ((prediction.churn_probability || 0) >= 0.7) {
      item.high_churn_count += 1;
      highChurnSessions.push({
        tenant_id: prediction.tenant_id,
        session_id: prediction.session_id,
        churn_probability: prediction.churn_probability,
        drop_off_feature: prediction.drop_off_feature,
        predicted_at: prediction.created_at,
      });
    }
  }

  const featureChurnRate = [...featureMap.values()]
    .map((item) => ({
      feature: item.feature,
      prediction_count: item.prediction_count,
      high_churn_count: item.high_churn_count,
      churn_rate: item.prediction_count ? Number((item.high_churn_count / item.prediction_count).toFixed(4)) : 0,
      avg_churn_probability: item.prediction_count
        ? Number((item.churn_probability_sum / item.prediction_count).toFixed(4))
        : 0,
    }))
    .sort((a, b) => b.avg_churn_probability - a.avg_churn_probability);

  return {
    total_predictions: predictions.length,
    high_churn_session_count: highChurnSessions.length,
    top_drop_off_features: featureChurnRate.slice(0, 10),
    high_churn_sessions: highChurnSessions.sort((a, b) => b.churn_probability - a.churn_probability).slice(0, 20),
    feature_churn_rate: featureChurnRate,
  };
}

module.exports = { summarizePredictions };
