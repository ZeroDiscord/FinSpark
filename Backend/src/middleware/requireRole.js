'use strict';

const { UnauthorizedError } = require('../utils/errors');

/**
 * requireRole(...roles)
 * Middleware factory that checks req.user.role against an allowed list.
 * Must be used AFTER requireAuth (which populates req.user).
 *
 * Usage:
 *   router.post('/train', requireAuth, requireRole('admin', 'ops'), handler)
 */
function requireRole(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) return next(new UnauthorizedError('Authentication required.'));
    if (!roles.includes(req.user.role)) {
      const err = new UnauthorizedError(
        `Role '${req.user.role}' is not permitted. Required: ${roles.join(' | ')}.`
      );
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      return next(err);
    }
    return next();
  };
}

module.exports = { requireRole };
