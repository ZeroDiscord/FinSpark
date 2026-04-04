'use strict';

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/finspark',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  ml: {
    baseUrl: process.env.ML_BASE_URL || 'http://localhost:8000',
    apiKey: process.env.ML_API_KEY || 'dev-secret-key',
  },

  uploads: {
    apkDir: process.env.APK_UPLOAD_DIR || './uploads/apk',
    csvDir: process.env.CSV_UPLOAD_DIR || './uploads/csv',
    maxApkSizeMb: 150,
    maxCsvSizeMb: 50,
  },

  apktool: {
    jarPath: process.env.APKTOOL_JAR_PATH || '/usr/local/bin/apktool.jar',
  },

  asana: {
    clientId: process.env.ASANA_CLIENT_ID || '',
    clientSecret: process.env.ASANA_CLIENT_SECRET || '',
    redirectUri: process.env.ASANA_REDIRECT_URI || 'http://localhost:3001/api/asana/oauth/callback',
    tokenEncryptionKey: process.env.ASANA_TOKEN_ENCRYPTION_KEY || '0'.repeat(64),
  },

  piiSalt: process.env.PII_SALT || 'CHANGE_ME',

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

module.exports = config;
