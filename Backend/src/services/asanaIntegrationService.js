'use strict';

const legacyAsanaService = require('../../services/asanaService');

async function getConnectUrl(state) {
  return legacyAsanaService.getAuthUrl(state);
}

module.exports = {
  getConnectUrl,
  exchangeCode: legacyAsanaService.exchangeCode,
  getWorkspace: legacyAsanaService.getWorkspace,
  saveConnection: legacyAsanaService.saveConnection,
  getConnection: legacyAsanaService.getConnection,
  getProjects: legacyAsanaService.getProjects,
  createTask: legacyAsanaService.createTask,
};
