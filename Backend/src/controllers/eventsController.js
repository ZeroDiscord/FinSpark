'use strict';

const { ingestEvents } = require('../services/events/eventIngestionService');

async function postEvents(req, res) {
  const result = await ingestEvents(req.body);
  return res.status(202).json({
    success: true,
    data: result,
  });
}

module.exports = { postEvents };
