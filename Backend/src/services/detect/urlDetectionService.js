'use strict';

const puppeteer = require('puppeteer');
const axios = require('axios');
const config = require('../../../config');
const logger = require('../../../utils/logger');
const { buildFeatureCandidates } = require('./candidateBuilder');
const { toHierarchy } = require('./hierarchy');

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-flash-1.5';

function normalizeUrl(base, href) {
  try {
    return new URL(href, base).toString().split('#')[0];
  } catch {
    return null;
  }
}

function isInternal(base, href) {
  try {
    return new URL(base).hostname === new URL(href).hostname;
  } catch {
    return false;
  }
}

async function extractPageSignals(page, url) {
  return page.evaluate((pageUrl) => {
    const textOf = (selector) =>
      Array.from(document.querySelectorAll(selector))
        .map((el) => (el.textContent || el.getAttribute('placeholder') || '').trim())
        .filter((t) => t && t.length > 2 && t.length < 100);

    return {
      url: pageUrl,
      title: document.title || '',
      headings: textOf('h1, h2, h3'),
      buttons: textOf('button, [role="button"], input[type="submit"]'),
      navItems: textOf('nav a, aside a, header a'),
      formLabels: textOf('label'),
      links: Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')).filter(Boolean),
    };
  }, url);
}

async function crawlPages(startUrl, maxPages = 10, maxDepth = 2) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const queue = [{ url: startUrl, depth: 0 }];
  const visited = new Set();
  const pages = [];

  try {
    while (queue.length && visited.size < maxPages) {
      const current = queue.shift();
      if (!current?.url || visited.has(current.url)) continue;
      visited.add(current.url);

      const page = await browser.newPage();
      try {
        await page.goto(current.url, { waitUntil: 'networkidle2', timeout: 60000 });
        const signals = await extractPageSignals(page, current.url);
        pages.push(signals);

        if (current.depth < maxDepth) {
          for (const rawHref of signals.links) {
            const next = normalizeUrl(current.url, rawHref);
            if (next && isInternal(startUrl, next) && !visited.has(next)) {
              queue.push({ url: next, depth: current.depth + 1 });
            }
          }
        }
      } catch (error) {
        logger.warn({ event: 'detect_url_page_failed', url: current.url, error: error.message });
      } finally {
        await page.close().catch(() => null);
      }
    }
  } finally {
    await browser.close();
  }

  return pages;
}

function buildWebContext(pages) {
  const sections = [];

  const titles = [...new Set(pages.map((p) => p.title).filter(Boolean))];
  if (titles.length) sections.push(`## Page Titles\n${titles.join('\n')}`);

  const urls = pages.map((p) => { try { return new URL(p.url).pathname; } catch { return null; } }).filter(Boolean);
  if (urls.length) sections.push(`## URL Paths Crawled\n${[...new Set(urls)].join('\n')}`);

  const headings = [...new Set(pages.flatMap((p) => p.headings))].slice(0, 80);
  if (headings.length) sections.push(`## Headings (h1/h2/h3)\n${headings.join('\n')}`);

  const navItems = [...new Set(pages.flatMap((p) => p.navItems))].slice(0, 60);
  if (navItems.length) sections.push(`## Navigation Menu Items\n${navItems.join('\n')}`);

  const buttons = [...new Set(pages.flatMap((p) => p.buttons))].slice(0, 80);
  if (buttons.length) sections.push(`## Button / CTA Text\n${buttons.join('\n')}`);

  const labels = [...new Set(pages.flatMap((p) => p.formLabels))].slice(0, 60);
  if (labels.length) sections.push(`## Form Labels\n${labels.join('\n')}`);

  return sections.join('\n\n');
}

async function extractFeaturesWithAI(pages, siteUrl) {
  const apiKey = config.openrouter?.apiKey;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');

  const context = buildWebContext(pages);
  if (!context.trim()) return [];

  const prompt = `You are a product analyst specializing in web applications. I crawled a website (${siteUrl}) and collected the following signals from its pages — page titles, URL paths, headings, navigation items, button text, and form labels.

Your task: identify the distinct **user-facing features and capabilities** this web application offers. Focus on what users can actually DO in the app, not marketing copy or generic UI elements.

**Output format — respond ONLY with a JSON array, no other text:**
[
  {
    "l1_domain": "Top-level product area (e.g. Authentication, Dashboard, Payments, Reporting, Settings)",
    "l2_module": "Feature module (e.g. User Login, Invoice Management, Team Collaboration)",
    "l3_feature": "Specific feature or action (e.g. Google SSO, Export PDF Invoice, Invite Team Member)",
    "confidence": 0.0 to 1.0,
    "reasoning": "Brief one-line reason based on the signals"
  }
]

Rules:
- Only real user-facing features — skip generic terms like "Home", "Contact Us", "Footer"
- Merge duplicates — if nav item and button describe the same feature, one entry only
- Confidence 0.9+ = explicit nav/heading, 0.7-0.9 = button/form evidence, <0.7 = inferred from URL
- Aim for 10-40 features; capture both breadth and depth
- l1_domain: 1-3 words, l2_module: 2-4 words, l3_feature: 2-5 words

Website Signals:
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
        'X-Title': 'FinSpark URL Feature Extractor',
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
    raw_name: item.l3_feature || item.l2_module || 'Feature',
    raw_names: [item.l3_feature || item.l2_module || 'Feature'],
    confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.7)),
    reasoning: item.reasoning || '',
    source_type: 'url_ai',
    evidence: [],
  }));
}

/**
 * Build synthetic page objects from a plain list of path strings.
 * Used when the user supplies manual paths or selects from the crawler results
 * — we skip re-crawling those individual pages and just feed the paths to the AI.
 */
function pathsToSyntheticPages(baseUrl, paths) {
  return paths.map((p) => {
    const fullUrl = (() => { try { return new URL(p, baseUrl).toString(); } catch { return baseUrl; } })();
    const label = p.replace(/^\//, '').replace(/[/_-]+/g, ' ').trim();
    return {
      url: fullUrl,
      title: label,
      headings: [label],
      buttons: [],
      navItems: [label],
      formLabels: [],
    };
  });
}

async function detectFeaturesFromUrl(url, options = {}) {
  const maxPages = Number(options.max_pages || 10);
  const maxDepth = Number(options.max_depth || 2);
  const manualPaths = options.manual_paths;       // string[] from manual mode
  const selectedPaths = options.selected_paths;   // { path, title, ... }[] from crawl-discovery mode

  let pages;
  let pagesCrawledCount = 0;

  if (manualPaths && manualPaths.length > 0) {
    // Manual mode: no crawl, build synthetic pages from user-supplied paths
    pages = pathsToSyntheticPages(url, manualPaths);
    pagesCrawledCount = 0;
  } else if (selectedPaths && selectedPaths.length > 0) {
    // Crawl-discovery mode: user already chose paths, build synthetic pages from them
    const pathStrings = selectedPaths.map((p) => (typeof p === 'string' ? p : p.path));
    pages = pathsToSyntheticPages(url, pathStrings);
    pagesCrawledCount = selectedPaths.length;
  } else {
    // Default: full Puppeteer crawl
    try {
      pages = await crawlPages(url, maxPages, maxDepth);
      pagesCrawledCount = pages.length;
    } catch (error) {
      logger.warn({ event: 'detect_url_crawl_failed', url, error: error.message });
      pages = [];
    }
  }

  // Build raw items for rule-based fallback
  const rawItems = [];
  for (const page of pages) {
    try {
      const pathname = new URL(page.url).pathname;
      rawItems.push({ raw: pathname, evidence: { type: 'url_path', value: pathname, page: page.url }, weight: 1.8 });
    } catch {}
    [page.title, ...page.headings].filter(Boolean).forEach((value) => {
      rawItems.push({ raw: value, evidence: { type: 'heading', value, page: page.url }, weight: 2 });
    });
    page.buttons.forEach((value) => {
      rawItems.push({ raw: value, evidence: { type: 'button_text', value, page: page.url }, weight: 1.8 });
    });
    page.navItems.forEach((value) => {
      rawItems.push({ raw: value, evidence: { type: 'menu_label', value, page: page.url }, weight: 1.5 });
    });
    page.formLabels.forEach((value) => {
      rawItems.push({ raw: value, evidence: { type: 'form_label', value, page: page.url }, weight: 1.4 });
    });
  }

  // Try AI extraction; fall back to rule-based on error
  let features;
  let extractionMode = 'ai';
  try {
    const aiFeatures = await extractFeaturesWithAI(pages, url);
    if (aiFeatures.length > 0) {
      features = aiFeatures;
    } else {
      throw new Error('AI returned no features');
    }
  } catch (aiError) {
    logger.warn({ event: 'url_ai_extraction_fallback', error: aiError.message });
    extractionMode = 'rules';
    const candidates = buildFeatureCandidates(rawItems, 'url');
    features = toHierarchy(candidates, 'url');
  }

  return {
    source_type: 'url',
    extraction_mode: extractionMode,
    summary: {
      pages_crawled: pagesCrawledCount,
      paths_analysed: pages.length,
      detected_count: rawItems.length,
      deduplicated_count: features.length,
    },
    page_title: pages[0]?.title || url,
    features,
  };
}

module.exports = { detectFeaturesFromUrl };
