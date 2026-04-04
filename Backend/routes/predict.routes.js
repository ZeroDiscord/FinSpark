'use strict';

const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const mlClient = require('../services/mlClient');

// POST /api/predict
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { tenant_id, session_sequence, feedback_text, deployment_mode } = req.body;
    if (!tenant_id || !session_sequence || !Array.isArray(session_sequence)) {
      return res.status(400).json({ error: 'tenant_id and session_sequence (array) are required.' });
    }
    if (session_sequence.length === 0) {
      return res.status(400).json({ error: 'session_sequence must not be empty.' });
    }

    const mlRes = await mlClient.post('/predict', {
      tenant_id,
      session_sequence,
      feedback_text: feedback_text || null,
      deployment_mode: deployment_mode || 'cloud',
    });

    res.json(mlRes.data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
