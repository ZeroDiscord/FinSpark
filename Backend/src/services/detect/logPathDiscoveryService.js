'use strict';

const fs = require('fs');
const readline = require('readline');
const { URL } = require('url');

function parseLogLine(line) {
  if (!line || !line.trim()) return null;
  const text = line.trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return parsed.path || parsed.url || parsed.request?.path || parsed.request?.url || parsed.request_path || parsed.requestUrl || parsed.request_uri || parsed.request?.request_uri || null;
    }
  } catch (_) {
    // continue with heuristics
  }

  const pathMatch = text.match(/"path"\s*:\s*"([^"]+)"/i);
  if (pathMatch) return pathMatch[1];

  const urlMatch = text.match(/"url"\s*:\s*"([^"]+)"/i);
  if (urlMatch) return urlMatch[1];

  if (text.startsWith('/') || /^https?:\/\//i.test(text)) {
    return text;
  }

  return null;
}

function normalizePath(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();

  try {
    const url = new URL(trimmed, 'https://example.com');
    const pathname = url.pathname || '/';
    return pathname.split('?')[0].split('#')[0] || '/';
  } catch {
    if (trimmed.startsWith('/')) {
      return trimmed.split('?')[0].split('#')[0] || '/';
    }
    return null;
  }
}

function detectBaseUrl(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null;

  try {
    const url = new URL(rawValue);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return null;
  }
}

async function extractPathsFromLogFile(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const counts = new Map();
  const hosts = new Map();
  let totalLines = 0;
  let parsedLines = 0;

  for await (const line of rl) {
    totalLines += 1;
    const rawPath = parseLogLine(line);
    if (!rawPath) continue;
    const path = normalizePath(rawPath);
    if (!path) continue;
    parsedLines += 1;
    counts.set(path, (counts.get(path) || 0) + 1);

    const baseUrl = detectBaseUrl(rawPath);
    if (baseUrl) {
      hosts.set(baseUrl, (hosts.get(baseUrl) || 0) + 1);
    }
  }

  if (counts.size === 0) {
    throw new Error('No valid request paths could be extracted from the uploaded log file.');
  }

  const sortedPaths = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([path, count]) => ({ path, count }));

  const preferredHost = [...hosts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    total_lines: totalLines,
    parsed_lines: parsedLines,
    base_url: preferredHost,
    path_stats: sortedPaths,
  };
}

module.exports = {
  extractPathsFromLogFile,
};
