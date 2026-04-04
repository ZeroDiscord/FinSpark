'use strict';

const { cleanFeatureName } = require('./nameCleaner');
const { classifyFeature } = require('./categoryRules');
const { computeConfidence } = require('./confidence');

function pushCandidate(map, raw, evidence, sourceType, weight = 1) {
  const clean = cleanFeatureName(raw);
  if (!clean) return;

  const key = clean.toLowerCase();
  if (!map.has(key)) {
    map.set(key, {
      source_type: sourceType,
      clean_name: clean,
      raw_names: new Set(),
      evidence: [],
      weight_sum: 0,
    });
  }

  const candidate = map.get(key);
  candidate.raw_names.add(raw);
  candidate.evidence.push(evidence);
  candidate.weight_sum += weight;
}

function buildFeatureCandidates(rawItems, sourceType) {
  const map = new Map();

  for (const item of rawItems) {
    pushCandidate(map, item.raw, item.evidence, sourceType, item.weight);
  }

  return [...map.values()]
    .map((candidate) => {
      const category = classifyFeature(candidate.clean_name);
      const feature = {
        ...candidate,
        ...category,
        raw_names: [...candidate.raw_names],
      };
      feature.confidence = computeConfidence(feature);
      return feature;
    })
    .sort((a, b) => b.confidence - a.confidence);
}

module.exports = { buildFeatureCandidates };
