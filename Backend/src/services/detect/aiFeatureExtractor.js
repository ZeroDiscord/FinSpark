'use strict';

const axios = require('axios');
const config = require('../../../config');

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
// Low-cost model — fast and good at structured JSON output
const MODEL = 'google/gemini-flash-1.5';

function buildContext({ activityNames, fragmentNames, navLabels, layoutStrings, apiPaths, sourceSnippets }) {
  const sections = [];

  if (activityNames.length) {
    sections.push(`## Activity Names (from AndroidManifest.xml)\n${activityNames.slice(0, 60).join('\n')}`);
  }
  if (fragmentNames.length) {
    sections.push(`## Fragment Class Names\n${fragmentNames.slice(0, 60).join('\n')}`);
  }
  if (navLabels.length) {
    sections.push(`## Navigation Graph Labels\n${navLabels.slice(0, 60).join('\n')}`);
  }
  if (layoutStrings.length) {
    sections.push(`## UI Strings (button text, titles, hints from layouts)\n${layoutStrings.slice(0, 120).join('\n')}`);
  }
  if (apiPaths.length) {
    sections.push(`## API Endpoint Paths found in source\n${apiPaths.slice(0, 60).join('\n')}`);
  }
  if (sourceSnippets.length) {
    sections.push(`## Source Code Snippets (setTitle calls)\n${sourceSnippets.slice(0, 40).join('\n')}`);
  }

  return sections.join('\n\n');
}

async function extractFeaturesWithAI(apkSignals) {
  const apiKey = config.openrouter?.apiKey;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');

  const context = buildContext(apkSignals);
  if (!context.trim()) return [];

  const prompt = `You are a mobile product analyst. I will give you extracted signals from a decompiled Android APK — activity names, fragments, UI strings, navigation labels, and API paths.

Your task: identify the distinct **user-facing features** this app offers. Focus on what end-users actually do or see, not internal implementation details.

**Output format — respond ONLY with a JSON array, no other text:**
[
  {
    "l1_domain": "Top-level product area (e.g. Authentication, Payments, Dashboard, Settings, Messaging)",
    "l2_module": "Feature module within that area (e.g. Login, Biometric Auth, Transfer Funds)",
    "l3_feature": "Specific feature or action (e.g. Fingerprint Login, Send Money, View Statement)",
    "confidence": 0.0 to 1.0,
    "reasoning": "Brief one-line reason this is a real feature"
  }
]

Rules:
- Only include genuine user-facing features (not internal helpers, base classes, utility screens)
- Remove duplicates — if two signals mean the same thing, merge them into one entry
- Confidence 0.9+ = very clear (explicit UI label or nav graph entry), 0.6-0.9 = likely (activity/fragment name), <0.6 = inferred (API path only)
- Aim for 10-40 features total
- l1_domain should be 1-3 words, l2_module 2-4 words, l3_feature 2-5 words

APK Signals:
${context}`;

  const response = await axios.post(
    OPENROUTER_API,
    {
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://finspark.app',
        'X-Title': 'FinSpark APK Feature Extractor',
      },
    }
  );

  const text = response.data.choices?.[0]?.message?.content || '';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI response did not contain a valid JSON array.');

  const parsed = JSON.parse(jsonMatch[0]);

  return parsed.map((item, index) => ({
    id: `ai_${index + 1}`,
    l1_domain: item.l1_domain || 'Other',
    l2_module: item.l2_module || item.l3_feature || 'Feature',
    l3_feature: item.l3_feature || 'Feature',
    clean_name: item.l3_feature || item.l2_module || 'Feature',
    confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.7)),
    reasoning: item.reasoning || '',
    source_type: 'apk_ai',
  }));
}

module.exports = { extractFeaturesWithAI };
