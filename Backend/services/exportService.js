'use strict';

const { stringify } = require('csv-stringify');
const archiver = require('archiver');
const { query } = require('../db/client');
const mlClient = require('../services/mlClient');

async function safeML(path, params) {
  try {
    const res = await mlClient.get(path, { params });
    return res.data;
  } catch {
    return null;
  }
}

function toCSV(rows, columns) {
  return new Promise((resolve, reject) => {
    const data = [columns, ...rows.map(r => columns.map(c => r[c] ?? ''))];
    stringify(data, (err, out) => err ? reject(err) : resolve(out));
  });
}

async function buildCsvExport(tenantDbId, tenantHash, type) {
  switch (type) {
    case 'features': {
      const res = await query(
        'SELECT name, l3_feature, l2_module, l1_domain, source_type, confidence, created_at FROM features WHERE tenant_id = $1',
        [tenantDbId]
      );
      return toCSV(res.rows, ['name','l3_feature','l2_module','l1_domain','source_type','confidence','created_at']);
    }
    case 'recommendations': {
      const res = await query(
        'SELECT title, description, priority, category, affected_feature, metric_impact, action_type, rule_id, asana_task_url, created_at FROM recommendations WHERE tenant_id = $1 ORDER BY CASE priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END',
        [tenantDbId]
      );
      return toCSV(res.rows, ['title','description','priority','category','affected_feature','metric_impact','action_type','rule_id','asana_task_url','created_at']);
    }
    case 'friction': {
      const data = await safeML('/features/friction', { tenant_id: tenantHash });
      const rows = data || [];
      return toCSV(rows, ['feature','absorption_probability','drop_off_rate','severity']);
    }
    case 'events': {
      const res = await query(
        `SELECT session_id, user_id, timestamp, channel, l1_domain, l2_module,
                l3_feature, l4_action, duration_ms, success, churn_label
         FROM events WHERE tenant_id = $1 ORDER BY timestamp DESC LIMIT 10000`,
        [tenantDbId]
      );
      return toCSV(res.rows, ['session_id','user_id','timestamp','channel','l1_domain','l2_module','l3_feature','l4_action','duration_ms','success','churn_label']);
    }
    default:
      throw Object.assign(new Error(`Unknown export type: ${type}`), { status: 400 });
  }
}

/**
 * Build and stream a Power BI-compatible ZIP to the Express response.
 */
async function streamPowerBIZip(tenantDbId, tenantHash, res) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  // Fetch all data in parallel
  const [
    featuresRes,
    recsRes,
    eventsRes,
    frictionData,
    usageData,
    churnData,
    funnelData,
  ] = await Promise.allSettled([
    query('SELECT name,l3_feature,l2_module,l1_domain,source_type,confidence FROM features WHERE tenant_id = $1', [tenantDbId]),
    query(`SELECT title,description,priority,category,affected_feature,metric_impact,action_type,rule_id
           FROM recommendations WHERE tenant_id = $1 ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`, [tenantDbId]),
    query(`SELECT session_id,user_id,timestamp,channel,l1_domain,l2_module,l3_feature,l4_action,duration_ms,success,churn_label
           FROM events WHERE tenant_id = $1 ORDER BY timestamp DESC LIMIT 10000`, [tenantDbId]),
    safeML('/dashboard/friction',          { tenant_id: tenantHash }),
    safeML('/dashboard/feature-usage',     { tenant_id: tenantHash }),
    safeML('/dashboard/churn-distribution',{ tenant_id: tenantHash }),
    safeML('/dashboard/funnel',            { tenant_id: tenantHash }),
  ]);

  // Helper to safely get rows
  const rows = (r) => r.status === 'fulfilled' ? (r.value?.rows || r.value || []) : [];

  // Helper to build CSV buffer from array of objects
  async function buildBuf(data, cols) {
    if (!Array.isArray(data) || !data.length) return Buffer.from(cols.join(',') + '\n');
    return Buffer.from(await toCSV(data, cols));
  }

  // feature_usage.csv
  archive.append(
    await buildBuf(rows(usageData), ['feature','usage_count','usage_pct','churn_rate']),
    { name: 'data/feature_usage.csv' }
  );

  // friction_analysis.csv
  archive.append(
    await buildBuf(rows(frictionData), ['feature','absorption_probability','drop_off_rate','severity']),
    { name: 'data/friction_analysis.csv' }
  );

  // churn_distribution.csv — flatten bins
  const cd = rows(churnData);
  let churnRows = [];
  if (cd?.bins) {
    churnRows = cd.bins.map((b, i) => ({
      bin_start: b, bin_end: cd.bins[i+1] || 1,
      complete_count: cd.complete_counts?.[i] || 0,
      churn_count: cd.churn_counts?.[i] || 0,
    }));
  }
  archive.append(
    await buildBuf(churnRows, ['bin_start','bin_end','complete_count','churn_count']),
    { name: 'data/churn_distribution.csv' }
  );

  // funnel_transitions.csv
  archive.append(
    await buildBuf(rows(funnelData), ['source','target','probability']),
    { name: 'data/funnel_transitions.csv' }
  );

  // recommendations.csv
  archive.append(
    await buildBuf(rows(recsRes), ['title','description','priority','category','affected_feature','metric_impact','action_type','rule_id']),
    { name: 'data/recommendations.csv' }
  );

  // session_events.csv
  archive.append(
    await buildBuf(rows(eventsRes), ['session_id','user_id','timestamp','channel','l1_domain','l2_module','l3_feature','l4_action','duration_ms','success','churn_label']),
    { name: 'data/session_events.csv' }
  );

  // connections.json
  const connections = {
    version: '1.0',
    tenant_id: tenantHash,
    exported_at: new Date().toISOString(),
    tables: [
      { name: 'FeatureUsage',      file: 'data/feature_usage.csv',       primary_key: 'feature', relationships: [{ to: 'FrictionAnalysis', on: 'feature' }] },
      { name: 'FrictionAnalysis',  file: 'data/friction_analysis.csv',    primary_key: 'feature', relationships: [] },
      { name: 'ChurnDistribution', file: 'data/churn_distribution.csv',   primary_key: null,      relationships: [] },
      { name: 'FunnelTransitions', file: 'data/funnel_transitions.csv',   primary_key: null,      relationships: [{ to: 'FeatureUsage', on: 'source=feature' }] },
      { name: 'Recommendations',   file: 'data/recommendations.csv',      primary_key: null,      relationships: [{ to: 'FeatureUsage', on: 'affected_feature=feature' }] },
      { name: 'SessionEvents',     file: 'data/session_events.csv',       primary_key: null,      relationships: [{ to: 'FeatureUsage', on: 'l3_feature=feature' }] },
    ],
  };
  archive.append(JSON.stringify(connections, null, 2), { name: 'connections.json' });

  // README.txt
  const readme = [
    'FinSpark Intelligence — Power BI Export Package',
    '================================================',
    '',
    'HOW TO IMPORT INTO POWER BI DESKTOP:',
    '1. Unzip this archive to a local folder',
    '2. Open Power BI Desktop',
    '3. Home > Get Data > Text/CSV',
    '4. Select each CSV file in the "data/" folder and import',
    '5. In Model view, create relationships using connections.json as reference',
    '',
    'FILES:',
    '  data/feature_usage.csv        - Feature adoption and churn rates',
    '  data/friction_analysis.csv    - Drop-off probabilities per feature',
    '  data/churn_distribution.csv   - Session churn probability distribution',
    '  data/funnel_transitions.csv   - Markov-derived user journey transitions',
    '  data/recommendations.csv      - AI-generated recommendations',
    '  data/session_events.csv       - Last 10,000 session events',
    '',
    `Exported: ${new Date().toISOString()}`,
    'Generated by FinSpark Intelligence Platform',
  ].join('\n');
  archive.append(readme, { name: 'README.txt' });

  await archive.finalize();
}

module.exports = { buildCsvExport, streamPowerBIZip };
