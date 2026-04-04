'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./utils/logger');
const rateLimiter = require('./middleware/rateLimiter');
const { errorHandler } = require('./src/middleware/errorHandler');

// Routes
const authRoutes = require('./src/routes/auth.routes');
const tenantRoutes = require('./routes/tenant.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const detectRoutes = require('./src/routes/detect.routes');
const eventsRoutes = require('./src/routes/events.routes');
const featuresRoutes = require('./src/routes/features.routes');
const trackingRoutes = require('./src/routes/tracking.routes');
const mlRoutes = require('./src/routes/ml.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const predictRoutes = require('./routes/predict.routes');
const recommendRoutes = require('./src/routes/recommendation.routes');
const asanaRoutes = require('./src/routes/asana.routes');
const exportRoutes = require('./src/routes/export.routes');

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
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path, ip: req.ip });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/detect', detectRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api', mlRoutes);
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
