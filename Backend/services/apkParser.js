'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const config = require('../config');
const logger = require('../utils/logger');

// Domain keyword map: keyword → { l2_module, l1_domain }
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

function mapDomain(name) {
  for (const entry of DOMAIN_MAP) {
    if (entry.regex.test(name)) return { l2_module: entry.l2, l1_domain: entry.l1 };
  }
  return { l2_module: 'general', l1_domain: 'product' };
}

function pascalToSnake(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}

function normalizeActivityName(fullName) {
  const parts = fullName.split('.');
  let short = parts[parts.length - 1];
  short = short.replace(/(Activity|Fragment|Screen|View|Page)$/i, '');
  return pascalToSnake(short);
}

function isFrameworkClass(name) {
  return /^(com\.google\.|androidx\.|android\.|com\.facebook\.|kotlin\.|java\.)/.test(name);
}

function runApktool(apkPath, outputDir) {
  return new Promise((resolve, reject) => {
    const jarPath = config.apktool.jarPath;
    const args = ['-jar', jarPath, 'd', apkPath, '-o', outputDir, '--force'];
    const proc = spawn('java', args, { timeout: 60_000 });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`apktool exited with code ${code}: ${stderr.slice(0, 500)}`));
    });
    proc.on('error', reject);
  });
}

async function parseManifest(outputDir) {
  const manifestPath = path.join(outputDir, 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) return [];
  const xml = fs.readFileSync(manifestPath, 'utf8');
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: true });
  const appNode = parsed?.manifest?.application?.[0];
  if (!appNode || !appNode.activity) return [];
  return appNode.activity
    .map(a => a.$?.['android:name'])
    .filter(Boolean);
}

function hasLayoutFile(outputDir, snakeName) {
  const layoutDir = path.join(outputDir, 'res', 'layout');
  if (!fs.existsSync(layoutDir)) return false;
  const files = fs.readdirSync(layoutDir);
  return files.some(f => f.toLowerCase().includes(snakeName.replace(/_/g, '')));
}

/**
 * Main entry point.
 * @param {string} apkPath  Absolute path to uploaded .apk file
 * @returns {Promise<Array>} Array of feature objects
 */
async function extractFeatures(apkPath) {
  const outputDir = apkPath.replace(/\.apk$/i, '_decompiled');
  const features = [];
  const rawNames = [];

  try {
    await runApktool(apkPath, outputDir);
  } catch (err) {
    logger.warn({ event: 'apktool_failed', error: err.message });
    // Return empty — apktool not installed; graceful degradation
    return { features: [], raw_activity_names: [] };
  }

  try {
    const activities = await parseManifest(outputDir);
    const custom = activities.filter(a => !isFrameworkClass(a));
    rawNames.push(...custom);

    const seen = new Set();
    for (const fullName of custom) {
      const l3 = normalizeActivityName(fullName);
      if (!l3 || seen.has(l3)) continue;
      seen.add(l3);

      const { l2_module, l1_domain } = mapDomain(l3);
      const hasLayout = hasLayoutFile(outputDir, l3);
      const confidence = hasLayout ? 0.95 : 0.75;
      const humanName = l3
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      features.push({
        name: humanName,
        l3_feature: l3,
        l2_module,
        l1_domain,
        confidence,
        raw_identifier: fullName,
        source_type: 'apk',
      });
    }
  } finally {
    // Cleanup decompiled directory
    try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch {}
  }

  return { features, raw_activity_names: rawNames };
}

module.exports = { extractFeatures };
