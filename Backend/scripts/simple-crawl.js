'use strict';

const puppeteer = require('puppeteer');
const { URL } = require('url');

const startUrl = process.argv[2];
const maxPages = Number(process.argv[3] || 50);
const maxDepth = Number(process.argv[4] || 2);

if (!startUrl) {
  console.error('Usage: node simple-crawl.js <url> [maxPages] [maxDepth]');
  process.exit(1);
}

function normalizeUrl(base, href) {
  try {
    const url = new URL(href, base);
    url.hash = '';
    let str = url.toString();
    if (str.endsWith('/') && str !== `${url.origin}/`) {
      str = str.slice(0, -1);
    }
    return str;
  } catch {
    return null;
  }
}

function isSameHost(base, href) {
  try {
    return new URL(base).hostname === new URL(href).hostname;
  } catch {
    return false;
  }
}

function isAsset(url) {
  return /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|css|js|map|pdf|zip|json|xml)(\?.*)?$/i.test(url);
}

async function crawl(startUrl, maxPages, maxDepth) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const queue = [{ url: startUrl, depth: 0 }];
  const visited = new Set();
  const pathCounts = new Map();

  while (queue.length && visited.size < maxPages) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    let page = null;
    try {
      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (compatible; simple-crawler/1.0)');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .filter(Boolean),
      );

      for (const rawHref of links) {
        const normalized = normalizeUrl(url, rawHref);
        if (!normalized) continue;
        if (!isSameHost(startUrl, normalized)) continue;
        if (isAsset(normalized)) continue;

        const pathname = new URL(normalized).pathname || '/';
        pathCounts.set(pathname, (pathCounts.get(pathname) || 0) + 1);

        if (depth + 1 <= maxDepth && !visited.has(normalized)) {
          queue.push({ url: normalized, depth: depth + 1 });
        }
      }
    } catch (err) {
      console.error(`Failed to crawl ${url}: ${err.message}`);
    } finally {
      if (page) await page.close().catch(() => null);
    }
  }

  await browser.close();

  return [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([path, count]) => ({ path, count }));
}

crawl(startUrl, maxPages, maxDepth)
  .then((results) => {
    console.log(`Crawled ${results.length} unique paths from ${startUrl}`);
    for (const item of results) {
      console.log(`${item.count}\t${item.path}`);
    }
  })
  .catch((err) => {
    console.error('Crawler error:', err);
    process.exit(1);
  });
