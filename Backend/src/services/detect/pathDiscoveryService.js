'use strict';

const puppeteer = require('puppeteer');
const axios = require('axios');
const logger = require('../../../utils/logger');

/**
 * Fetch and parse robots.txt — returns all Allow/Disallow paths.
 * Never throws; silently returns empty array on any error.
 */
async function fetchRobotsPaths(baseUrl) {
  try {
    const origin = new URL(baseUrl).origin;
    const { data } = await axios.get(`${origin}/robots.txt`, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinSpark-Crawler/1.0)' },
      validateStatus: (s) => s === 200,
    });

    const paths = [];
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      // Match both Allow and Disallow directives
      const match = trimmed.match(/^(?:dis)?allow\s*:\s*(.+)/i);
      if (!match) continue;
      const p = match[1].trim().split('*')[0]; // strip wildcard suffixes
      if (p && p !== '/' && !p.includes('?')) paths.push(p);
    }

    return [...new Set(paths)]; // deduplicate
  } catch {
    return [];
  }
}

function normalizeUrl(base, href) {
  try {
    const u = new URL(href, base);
    // Strip hash and trailing slash for dedup
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/') && s !== u.origin + '/') s = s.slice(0, -1);
    return s;
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
  return /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|map|pdf|zip|json|xml)(\?.*)?$/i.test(url);
}

/**
 * Spider a website and collect all internal paths.
 * Returns an array of path objects sorted by visit count descending.
 */
async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinSpark-SourceCrawler/1.0)' },
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return response.data;
}

function parseHrefAttributes(html) {
  const hrefs = [];
  const regex = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match;
  while ((match = regex.exec(html))) {
    const value = match[1] || match[2] || match[3];
    if (value) hrefs.push(value.trim());
  }
  return hrefs;
}

async function fetchArchivePaths(startUrl, { limit = 2000 } = {}) {
  const targetHost = (() => {
    try {
      return new URL(startUrl).host;
    } catch {
      return startUrl.replace(/https?:\/\//i, '').replace(/\/*$/, '');
    }
  })();

  const apiUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(targetHost + '/*')}&output=json&fl=original&filter=statuscode:200&collapse=urlkey&limit=${limit}`;
  try {
    const response = await axios.get(apiUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinSpark-ArchiveFetcher/1.0)',
      },
    });

    if (!Array.isArray(response.data) || response.data.length <= 1) {
      return [];
    }

    const urls = response.data.slice(1).map((row) => (Array.isArray(row) ? row[0] : row)).filter(Boolean);
    const paths = new Set();
    for (const rawUrl of urls) {
      try {
        const normalized = normalizeUrl(startUrl, rawUrl);
        if (!normalized || !isSameHost(startUrl, normalized) || isAsset(normalized)) continue;
        paths.add(new URL(normalized).pathname || '/');
      } catch {
        continue;
      }
    }

    return [...paths];
  } catch (err) {
    logger.warn({ event: 'archive_path_fetch_failed', url: startUrl, error: err.message });
    return [];
  }
}

async function discoverPaths(startUrl, { maxPages = 50, maxDepth = 2 } = {}) {
  const robotPaths = await fetchRobotsPaths(startUrl);
  const origin = (() => { try { return new URL(startUrl).origin; } catch { return startUrl; } })();

  const queue = [
    { url: startUrl, depth: 0, referer: null },
    ...robotPaths.map((p) => ({ url: `${origin}${p}`, depth: 1, referer: `${origin}/robots.txt` })),
  ];

  const visited = new Set();
  const pathCounts = new Map();
  const pathDetails = new Map();

  for (const p of robotPaths) pathCounts.set(p, (pathCounts.get(p) || 0) + 2);

  while (queue.length && visited.size < maxPages) {
    const current = queue.shift();
    if (!current?.url || visited.has(current.url)) continue;
    visited.add(current.url);

    let html;
    try {
      html = await fetchHtml(current.url);
    } catch (err) {
      logger.warn({ event: 'path_discovery_source_failed', url: current.url, error: err.message });
      continue;
    }

    const currentPath = (() => {
      try { return new URL(current.url).pathname || '/'; } catch { return '/'; }
    })();

    const title = (() => {
      try {
        const match = html.match(/<title>([^<]*)<\/title>/i);
        return match?.[1]?.trim().slice(0, 120) || '';
      } catch {
        return '';
      }
    })();

    const previous = pathDetails.get(currentPath);
    if (!previous || current.depth < previous.depth) {
      pathDetails.set(currentPath, {
        path: currentPath,
        full_url: current.url,
        title,
        depth: current.depth,
        referer: current.referer,
      });
    }

    const hrefs = parseHrefAttributes(html);
    for (const href of hrefs) {
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#') || href.startsWith('data:')) {
        continue;
      }

      const normalized = normalizeUrl(current.url, href);
      if (!normalized || !isSameHost(startUrl, normalized) || isAsset(normalized)) continue;

      const linkPath = (() => {
        try { return new URL(normalized).pathname || '/'; } catch { return '/'; }
      })();
      pathCounts.set(linkPath, (pathCounts.get(linkPath) || 0) + 1);

      if (current.depth < maxDepth && !visited.has(normalized) && !queue.some((item) => item.url === normalized)) {
        queue.push({ url: normalized, depth: current.depth + 1, referer: current.url });
      }
    }
  }

  const archivePaths = await fetchArchivePaths(startUrl, { limit: 2000 });
  for (const archivePath of archivePaths) {
    pathCounts.set(archivePath, (pathCounts.get(archivePath) || 0) + 1);
    if (!pathDetails.has(archivePath)) {
      pathDetails.set(archivePath, {
        path: archivePath,
        full_url: `${origin}${archivePath}`,
        title: 'Archive.org snapshot',
        depth: maxDepth + 1,
        referer: 'archive.org',
      });
    }
  }

  const paths = [...pathCounts.entries()].map(([path, count]) => {
    const details = pathDetails.get(path) || {};
    return {
      path,
      full_url: details.full_url || `${origin}${path}`,
      title: details.title || '',
      depth: details.depth ?? maxDepth + 1,
      link_count: count,
      referer: details.referer || 'archive.org',
    };
  });
  paths.sort((a, b) => b.link_count - a.link_count || a.depth - b.depth);

  return {
    base_url: startUrl,
    pages_crawled: visited.size,
    robots_paths: robotPaths,
    archive_paths: archivePaths,
    paths,
  };
}

module.exports = { discoverPaths };
