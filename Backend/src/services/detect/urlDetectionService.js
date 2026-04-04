'use strict';

const puppeteer = require('puppeteer');
const logger = require('../../../utils/logger');
const { buildFeatureCandidates } = require('./candidateBuilder');
const { toHierarchy } = require('./hierarchy');

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
        await page.goto(current.url, { waitUntil: 'networkidle2', timeout: 30000 });
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

async function detectFeaturesFromUrl(url, options = {}) {
  const maxPages = Number(options.max_pages || 10);
  const maxDepth = Number(options.max_depth || 2);

  let pages;
  try {
    pages = await crawlPages(url, maxPages, maxDepth);
  } catch (error) {
    logger.warn({ event: 'detect_url_crawl_failed', url, error: error.message });
    pages = [];
  }
  const rawItems = [];

  for (const page of pages) {
    try {
      const pathname = new URL(page.url).pathname;
      rawItems.push({
        raw: pathname,
        evidence: { type: 'url_path', value: pathname, page: page.url },
        weight: 1.8,
      });
    } catch {}

    [page.title, ...page.headings].filter(Boolean).forEach((value) => {
      rawItems.push({
        raw: value,
        evidence: { type: 'heading', value, page: page.url },
        weight: 2,
      });
    });

    page.buttons.forEach((value) => {
      rawItems.push({
        raw: value,
        evidence: { type: 'button_text', value, page: page.url },
        weight: 1.8,
      });
    });

    page.navItems.forEach((value) => {
      rawItems.push({
        raw: value,
        evidence: { type: 'menu_label', value, page: page.url },
        weight: 1.5,
      });
    });

    page.formLabels.forEach((value) => {
      rawItems.push({
        raw: value,
        evidence: { type: 'form_label', value, page: page.url },
        weight: 1.4,
      });
    });
  }

  const features = buildFeatureCandidates(rawItems, 'url');
  return {
    source_type: 'url',
    summary: {
      pages_crawled: pages.length,
      detected_count: rawItems.length,
      deduplicated_count: features.length,
    },
    page_title: pages[0]?.title || url,
    features: toHierarchy(features, 'url'),
  };
}

module.exports = { detectFeaturesFromUrl };
