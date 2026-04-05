'use strict';

const logger = require('../utils/logger');

// Domain keyword map (shared with APK parser)
const DOMAIN_MAP = [
  { regex: /kyc|verify|document|aadhaar|pan|id.?proof/i,  l2: 'kyc_engine',      l1: 'origination' },
  { regex: /loan|credit|disburs|apply|offer|bureau/i,     l2: 'loan_engine',     l1: 'origination' },
  { regex: /repay|payment|emi|installment/i,              l2: 'payment_engine',  l1: 'servicing' },
  { regex: /account|wallet|balance|statement/i,           l2: 'account_engine',  l1: 'servicing' },
  { regex: /dashboard|home|landing|main/i,                l2: 'user_hub',        l1: 'retention' },
  { regex: /profile|setting|notification/i,               l2: 'user_hub',        l1: 'retention' },
  { regex: /login|signup|register|otp|auth/i,             l2: 'auth_engine',     l1: 'onboarding' },
  { regex: /onboard|welcome|tour|intro/i,                 l2: 'onboarding_flow', l1: 'onboarding' },
];

const GENERIC_LABELS = new Set([
  'ok', 'cancel', 'close', 'yes', 'no', 'back', 'next', 'submit',
  'save', 'delete', 'edit', 'more', 'less', 'open', 'search', 'go',
  'click here', 'learn more', 'read more', 'view all', 'see all',
]);

function mapDomain(name) {
  for (const entry of DOMAIN_MAP) {
    if (entry.regex.test(name)) return { l2_module: entry.l2, l1_domain: entry.l1 };
  }
  return { l2_module: 'general', l1_domain: 'product' };
}

function textToSnake(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
}

function toHumanName(text) {
  return text
    .split(/[\s_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 80);
}

async function extractFromPage(page, seen, results, confidence) {
  const texts = await page.evaluate(() => {
    const collect = (selectors) =>
      selectors.flatMap(sel =>
        Array.from(document.querySelectorAll(sel))
          .map(el => (el.textContent || el.getAttribute('placeholder') || '').trim())
          .filter(t => t.length > 2 && t.length < 100)
      );

    return {
      nav:     collect(['nav a', '[role="navigation"] a', 'aside a', '.sidebar a', '.menu a']),
      buttons: collect(['button', '[role="button"]', 'input[type="submit"]', 'a.btn', 'a.button']),
      labels:  collect(['label', 'input[placeholder]', 'textarea[placeholder]', 'select']),
      headings:collect(['h1', 'h2', 'h3']),
    };
  });

  const add = (text, conf) => {
    const lower = text.toLowerCase().trim();
    if (GENERIC_LABELS.has(lower) || lower.length < 3) return;
    const l3 = textToSnake(lower);
    if (!l3 || seen.has(l3)) return;
    seen.add(l3);
    const { l2_module, l1_domain } = mapDomain(lower);
    results.push({
      name: toHumanName(lower),
      l3_feature: l3,
      l2_module,
      l1_domain,
      confidence: conf,
      raw_identifier: text,
      source_type: 'url',
    });
  };

  texts.nav.forEach(t => add(t, 0.90));
  texts.headings.forEach(t => add(t, 0.85));
  texts.buttons.forEach(t => add(t, 0.80));
  texts.labels.forEach(t => add(t, 0.75));
}

/**
 * Crawl a website URL and extract feature candidates.
 * @param {string} url
 * @param {number} crawlDepth  0 = single page, 1 = follow internal links once
 * @returns {Promise<{ features: Array, page_title: string }>}
 */
async function crawlWebsite(url, crawlDepth = 0) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    logger.warn('Puppeteer not installed — returning empty features for URL crawl.');
    return { features: [], page_title: url };
  }

  const TIMEOUT = 45_000;
  const MAX_SUBPAGES = 20;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const seen = new Set();
  const results = [];
  let pageTitle = url;

  try {
    const main = await browser.newPage();
    await main.setDefaultNavigationTimeout(60_000);

    await Promise.race([
      main.goto(url, { waitUntil: 'networkidle2' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT)),
    ]);

    pageTitle = await main.title().catch(() => url);
    await extractFromPage(main, seen, results, 0.85);

    if (crawlDepth > 0) {
      const origin = new URL(url).origin;
      const links = await main.evaluate((origin) => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(h => h.startsWith(origin) && !h.includes('#'))
          .slice(0, 30);
      }, origin);

      const uniqueLinks = [...new Set(links)].slice(0, MAX_SUBPAGES);
      for (const link of uniqueLinks) {
        try {
          const subPage = await browser.newPage();
          await subPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 15_000 });
          await extractFromPage(subPage, seen, results, 0.75);
          await subPage.close();
        } catch {
          // Skip failed sub-pages
        }
      }
    }
  } catch (err) {
    logger.warn({ event: 'crawl_error', url, error: err.message });
  } finally {
    await browser.close();
  }

  return { features: results, page_title: pageTitle };
}

module.exports = { crawlWebsite };
