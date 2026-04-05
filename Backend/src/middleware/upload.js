'use strict';

const fs = require('fs');
const multer = require('multer');
const path = require('path');
const config = require('../config/env');
const { InvalidFileError } = require('../utils/errors');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildStorage(dir) {
  ensureDir(dir);
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
    },
  });
}

const apkUpload = multer({
  storage: buildStorage(config.uploads.apkDir),
  limits: { fileSize: config.uploads.maxApkSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.apk')) return cb(null, true);
    return cb(new InvalidFileError('Only .apk files are allowed.'));
  },
});

const csvUpload = multer({
  storage: buildStorage(config.uploads.csvDir),
  limits: { fileSize: config.uploads.maxCsvSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.csv')) return cb(null, true);
    return cb(new InvalidFileError('Only .csv files are allowed.'));
  },
});

const logUpload = multer({
  storage: buildStorage(config.uploads.logDir),
  limits: { fileSize: config.uploads.maxLogSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.log', '.jsonl', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) return cb(null, true);
    return cb(new InvalidFileError('Only .log, .jsonl, or .txt files are allowed.'));
  },
});

module.exports = {
  uploadApkSingle: apkUpload.single('file'),
  uploadCsvSingle: csvUpload.single('file'),
  uploadLogSingle: logUpload.single('file'),
};
