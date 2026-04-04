'use strict';

const { detectFeaturesFromApk } = require('./apkDetectionService');
const { detectFeaturesFromUrl } = require('./urlDetectionService');

module.exports = { detectFeaturesFromApk, detectFeaturesFromUrl };
