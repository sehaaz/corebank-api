const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../errors/AppError');

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token gerekli'));
  }
  try {
    const payload = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
    req.user = { customerId: payload.customerId, role: payload.role };
    return next();
  } catch (err) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token geçersiz'));
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return next(new AppError(403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok'));
    }
    return next();
  };
}

module.exports = { auth, requireRole };
