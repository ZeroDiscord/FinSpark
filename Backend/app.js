'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

// Routes
const authRoutes = require('./routes/auth.routes');
const tenantRoutes = require('./routes/tenant.routes');
const uploadRoutes = require('./routes/upload.routes');
const featuresRoutes = require('./routes/features.routes');
const trackingRoutes = require('./routes/tracking.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const predictRoutes = require('./routes/predict.routes');
const recommendRoutes = require('./routes/recommend.routes');
const asanaRoutes = require('./routes/asana.routes');
const exportRoutes = require('./routes/export.routes');

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
app.use(cors({
  origin: [config.frontendUrl, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiter
app.use('/api/', rateLimiter);

// Request logging
app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path, ip: req.ip });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/predict', predictRoutes);
app.use('/api/recommendations', recommendRoutes);
app.use('/api/asana', asanaRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'finspark-backend' }));

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use(errorHandler);

module.exports = app;
