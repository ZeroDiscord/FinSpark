'use strict';

function computeConfidence(feature) {
  let score = 0.22;

  for (const evidence of feature.evidence) {
    if (evidence.type === 'activity') score += 0.28;
    if (evidence.type === 'fragment') score += 0.24;
    if (evidence.type === 'layout_name') score += 0.14;
    if (evidence.type === 'layout_id') score += 0.12;
    if (evidence.type === 'button_text') score += 0.20;
    if (evidence.type === 'menu_label') score += 0.18;
    if (evidence.type === 'toolbar_title') score += 0.18;
    if (evidence.type === 'heading') score += 0.18;
    if (evidence.type === 'form_label') score += 0.14;
    if (evidence.type === 'api_path') score += 0.10;
    if (evidence.type === 'nav_graph') score += 0.08;
    if (evidence.type === 'url_path') score += 0.15;
  }

  const multiSource = new Set(feature.evidence.map((e) => e.type)).size;
  if (multiSource >= 2) score += 0.08;
  if (multiSource >= 3) score += 0.05;
  if (feature.category_match) score += 0.1;

  if (['Main', 'Home', 'Dashboard'].includes(feature.clean_name)) score -= 0.15;
  if (/^[A-Z]?[a-z]$/.test(feature.clean_name.replace(/\s/g, ''))) score -= 0.2;
  if (/^[A-Za-z0-9]{6,}$/.test(feature.clean_name.replace(/\s/g, '')) && !feature.clean_name.includes(' ')) score -= 0.12;

  return Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))));
}

module.exports = { computeConfidence };
