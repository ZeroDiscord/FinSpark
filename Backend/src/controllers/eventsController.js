'use strict';

const { ingestEvents } = require('../services/events/eventIngestionService');
const UsageEvent = require('../database/models/UsageEvent');

async function postEvents(req, res) {
  const result = await ingestEvents(req.body);
  return res.status(202).json({
    success: true,
    data: result,
  });
}

async function getEvents(req, res) {
  const {
    tenant_id,
    page = 1,
    limit = 50,
    search = '',
    feature = '',
    deployment_type = '',
    success: successParam = '',
  } = req.query;

  if (!tenant_id) return res.status(400).json({ error: 'tenant_id is required.' });

  const query = { tenant_id };

  if (feature)          query.l3_feature     = { $regex: feature, $options: 'i' };
  if (deployment_type)  query.deployment_type = deployment_type;
  if (successParam !== '') query.success      = successParam === 'true';
  if (search) {
    query.$or = [
      { user_id:    { $regex: search, $options: 'i' } },
      { session_id: { $regex: search, $options: 'i' } },
      { l3_feature: { $regex: search, $options: 'i' } },
      { l1_domain:  { $regex: search, $options: 'i' } },
    ];
  }

  const skip      = (Math.max(1, Number(page)) - 1) * Math.min(200, Number(limit));
  const take      = Math.min(200, Number(limit));
  const [events, total] = await Promise.all([
    UsageEvent.find(query).sort({ timestamp: -1 }).skip(skip).limit(take).lean(),
    UsageEvent.countDocuments(query),
  ]);

  return res.json({ success: true, data: { events, total, page: Number(page), limit: take } });
}

module.exports = { postEvents, getEvents };
