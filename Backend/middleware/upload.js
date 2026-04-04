'use strict';

const multer = require('multer');
const path = require('path');
const config = require('../config');

function makeStorage(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  });
}

const uploadApk = multer({
  storage: makeStorage(config.uploads.apkDir),
  limits: { fileSize: config.uploads.maxApkSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.apk') || file.mimetype === 'application/vnd.android.package-archive') {
      cb(null, true);
    } else {
      cb(new Error('Only .apk files are allowed.'));
    }
  },
}).single('file');

const uploadCsv = multer({
  storage: makeStorage(config.uploads.csvDir),
  limits: { fileSize: config.uploads.maxCsvSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.csv') || file.mimetype === 'text/csv' || file.mimetype === 'application/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only .csv files are allowed.'));
    }
  },
}).single('file');

module.exports = { uploadApk, uploadCsv };
