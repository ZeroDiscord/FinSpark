'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const xml2js = require('xml2js');
const config = require('../../../config');
const logger = require('../../../utils/logger');
const { buildFeatureCandidates } = require('./candidateBuilder');
const { toHierarchy } = require('./hierarchy');

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { shell: true });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${command} failed: ${stderr.slice(0, 500)}`));
      resolve();
    });
    proc.on('error', reject);
  });
}

async function collectFiles(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(full, exts, acc);
    else if (exts.includes(path.extname(entry.name))) acc.push(full);
  }
  return acc;
}

async function readText(filePath) {
  try { return await fsp.readFile(filePath, 'utf8'); } catch { return null; }
}

async function decompile(apkPath) {
  const baseDir = apkPath.replace(/\.apk$/i, '');
  const apktoolDir = `${baseDir}_apktool`;
  const jadxDir = `${baseDir}_jadx`;

  await runProcess('java', ['-jar', config.apktool.jarPath, 'd', apkPath, '-o', apktoolDir, '--force']);
  try {
    await runProcess('jadx', ['-d', jadxDir, apkPath]);
  } catch (error) {
    logger.warn({ event: 'jadx_failed', error: error.message });
  }

  return { apktoolDir, jadxDir };
}

async function parseManifestSignals(apktoolDir) {
  const manifestPath = path.join(apktoolDir, 'AndroidManifest.xml');
  const xml = await readText(manifestPath);
  if (!xml) return [];

  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: true });
  const app = parsed?.manifest?.application?.[0];
  if (!app) return [];

  const activities = (app.activity || []).map((a) => a.$?.['android:name']).filter(Boolean);
  const aliases = (app['activity-alias'] || []).map((a) => a.$?.['android:name']).filter(Boolean);
  return [...activities, ...aliases].map((value) => ({
    raw: value.split('.').pop(),
    evidence: { type: 'activity', value, file: manifestPath },
    weight: 3,
  }));
}

async function parseLayoutSignals(apktoolDir) {
  const files = await collectFiles(path.join(apktoolDir, 'res'), ['.xml']);
  const items = [];

  for (const file of files) {
    const xml = await readText(file);
    if (!xml) continue;

    const layoutName = path.basename(file, '.xml');
    items.push({
      raw: layoutName,
      evidence: { type: 'layout_name', value: layoutName, file },
      weight: 1.4,
    });

    for (const match of xml.matchAll(/@\+id\/([A-Za-z0-9_]+)/g)) {
      items.push({
        raw: match[1],
        evidence: { type: 'layout_id', value: match[1], file },
        weight: 1.1,
      });
    }

    for (const match of xml.matchAll(/android:text="([^"]+)"/g)) {
      items.push({
        raw: match[1],
        evidence: { type: 'button_text', value: match[1], file },
        weight: 2,
      });
    }

    for (const match of xml.matchAll(/android:(title|hint)="([^"]+)"/g)) {
      items.push({
        raw: match[2],
        evidence: { type: match[1] === 'title' ? 'toolbar_title' : 'form_label', value: match[2], file },
        weight: 1.7,
      });
    }
  }

  return items;
}

async function parseSourceSignals(jadxDir) {
  const items = [];
  const files = await collectFiles(jadxDir, ['.java', '.kt']);

  for (const file of files) {
    const src = await readText(file);
    if (!src) continue;

    for (const match of src.matchAll(/class\s+([A-Za-z0-9_]+Fragment)\b/g)) {
      items.push({
        raw: match[1],
        evidence: { type: 'fragment', value: match[1], file },
        weight: 2.5,
      });
    }

    for (const match of src.matchAll(/setTitle\("([^"]+)"\)/g)) {
      items.push({
        raw: match[1],
        evidence: { type: 'toolbar_title', value: match[1], file },
        weight: 1.8,
      });
    }

    for (const match of src.matchAll(/"(\/[A-Za-z0-9/_-]+)"/g)) {
      items.push({
        raw: match[1],
        evidence: { type: 'api_path', value: match[1], file },
        weight: 1,
      });
    }
  }

  return items;
}

async function parseNavigationSignals(apktoolDir) {
  const navDir = path.join(apktoolDir, 'res', 'navigation');
  const files = await collectFiles(navDir, ['.xml']);
  const items = [];

  for (const file of files) {
    const xml = await readText(file);
    if (!xml) continue;
    for (const match of xml.matchAll(/android:label="([^"]+)"/g)) {
      items.push({
        raw: match[1],
        evidence: { type: 'nav_graph', value: match[1], file },
        weight: 1.4,
      });
    }
  }

  return items;
}

async function detectFeaturesFromApk(apkPath, uploadId = null) {
  const { apktoolDir, jadxDir } = await decompile(apkPath);

  try {
    const rawItems = [
      ...(await parseManifestSignals(apktoolDir)),
      ...(await parseLayoutSignals(apktoolDir)),
      ...(await parseSourceSignals(jadxDir)),
      ...(await parseNavigationSignals(apktoolDir)),
    ];

    const features = buildFeatureCandidates(rawItems, 'apk');
    return {
      source_type: 'apk',
      summary: {
        files_parsed: rawItems.length,
        detected_count: rawItems.length,
        deduplicated_count: features.length,
      },
      features: toHierarchy(features, 'apk', uploadId),
    };
  } finally {
    try { fs.rmSync(apktoolDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(jadxDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { detectFeaturesFromApk };
