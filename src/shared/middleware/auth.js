const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../errors/AppError');

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication token required'));
  }
  try {
    const payload = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
    req.user = { customerId: payload.customerId, role: payload.role };
    return next();
  } catch (err) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return next(new AppError(403, 'FORBIDDEN', 'You are not allowed to perform this action'));
    }
    return next();
  };
}

module.exports = { auth, requireRole };
