'use strict';

const fs = require('fs');
const csv = require('csv-parser');
const { InvalidCsvError, MissingColumnsError } = require('../utils/errors');

const REQUIRED_COLUMNS = [
  'tenant_id',
  'session_id',
  'user_id',
  'timestamp',
  'deployment_type',
  'channel',
  'l1_domain',
  'l2_module',
  'l3_feature',
  'l4_action',
  'l5_deployment_node',
  'duration_ms',
  'success',
  'metadata',
  'feedback_text',
  'churn_label',
];

function normalizeSuccess(value) {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function cleanRow(row) {
  return {
    tenant_id: String(row.tenant_id || '').trim(),
    session_id: String(row.session_id || '').trim(),
    user_id: String(row.user_id || '').trim(),
    timestamp: new Date(row.timestamp),
    deployment_type: String(row.deployment_type || '').trim(),
    channel: String(row.channel || '').trim(),
    l1_domain: String(row.l1_domain || '').trim(),
    l2_module: String(row.l2_module || '').trim(),
    l3_feature: String(row.l3_feature || '').trim(),
    l4_action: String(row.l4_action || '').trim(),
    l5_deployment_node: String(row.l5_deployment_node || '').trim(),
    duration_ms: Number(row.duration_ms || 0),
    success: normalizeSuccess(row.success),
    metadata: normalizeMetadata(row.metadata),
    feedback_text: row.feedback_text || '',
    churn_label: row.churn_label === '' || row.churn_label === undefined ? null : Number(row.churn_label),
  };
}

function validateRows(rows) {
  rows.forEach((row, index) => {
    if (!row.session_id || !row.l3_feature || Number.isNaN(row.timestamp.getTime())) {
      throw new InvalidCsvError(`Invalid CSV row at line ${index + 2}.`, { row });
    }
  });
}

function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let headersChecked = false;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('headers', (headers) => {
        headersChecked = true;
        const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
        if (missing.length) {
          reject(new MissingColumnsError(missing));
        }
      })
      .on('data', (row) => rows.push(cleanRow(row)))
      .on('end', () => {
        if (!headersChecked) return reject(new InvalidCsvError('CSV headers are missing.'));
        validateRows(rows);
        resolve({
          rows,
          rowCount: rows.length,
          preview: rows.slice(0, 5),
          requiredColumns: REQUIRED_COLUMNS,
        });
      })
      .on('error', (error) => reject(new InvalidCsvError(error.message)));
  });
}

module.exports = { REQUIRED_COLUMNS, parseCsvFile };
