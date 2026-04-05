'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');

const [,, rawTarget, rawLimit = '2000', rawOutput] = process.argv;
const limit = Number(rawLimit) || 2000;

if (!rawTarget) {
  console.error('Usage: node archive-url-fetcher.js <domain-or-url> [limit] [output-file]');
  console.error('Example: node archive-url-fetcher.js https://example.com 500 output.txt');
  process.exit(1);
}

function normalizeTarget(target) {
  try {
    const url = new URL(target);
    return url.host;
  } catch {
    return target.replace(/https?:\/\//i, '').replace(/\/*$/, '');
  }
}


function buildArchiveApi(targetHost, limit) {
  const query = `${targetHost}/*`;
  const params = new URLSearchParams({
    url: query,
    output: 'json',
    fl: 'original',
    collapse: 'urlkey',
    filter: 'statuscode:200',
    limit: String(limit),
  });
  return `https://web.archive.org/cdx/search/cdx?${params.toString()}`;
}

async function fetchArchiveUrls(target) {
  const apiUrl = buildArchiveApi(target, limit);
  console.error(`Fetching archive.org results for ${target}...`);

  const response = await axios.get(apiUrl, {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; finspark-archive-scraper/1.0)',
    },
  });

  if (!Array.isArray(response.data) || response.data.length <= 1) {
    throw new Error('No URLs found in the Archive.org index for this target.');
  }

  const urls = response.data.slice(1).map((row) => (Array.isArray(row) ? row[0] : row));
  return [...new Set(urls)].filter(Boolean);
}

function writeOutputFile(filePath, urls) {
  const resolved = path.resolve(process.cwd(), filePath);
  fs.writeFileSync(resolved, urls.join('\n'), { encoding: 'utf8' });
  return resolved;
}

(async () => {
  try {
    const targetHost = normalizeTarget(rawTarget);
    const urls = await fetchArchiveUrls(targetHost);

    console.error(`Found ${urls.length} unique archived URLs for ${targetHost}.`);
    if (rawOutput) {
      const filePath = writeOutputFile(rawOutput, urls);
      console.error(`Saved ${urls.length} URLs to ${filePath}`);
    }

    for (const url of urls) {
      console.log(url);
    }
  } catch (error) {
    console.error('Error:', error.message || error);
    process.exit(1);
  }
})();
