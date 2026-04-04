'use strict';

function ok(res, data, meta = undefined, status = 200) {
  return res.status(status).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

module.exports = { ok };
