'use strict';

function toHierarchy(features, sourceType, uploadId = null) {
  return features.map((feature, index) => ({
    id: feature.id || `det_${index + 1}`,
    upload_id: uploadId,
    source_type: sourceType,
    raw_name: feature.raw_names?.[0] || feature.clean_name,
    raw_names: feature.raw_names || [],
    clean_name: feature.clean_name,
    l1_domain: feature.l1_domain,
    l2_module: feature.l2_module,
    l3_feature: feature.l3_feature || feature.clean_name,
    confidence: feature.confidence,
    evidence: feature.evidence || [],
  }));
}

module.exports = { toHierarchy };
