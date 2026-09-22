const express = require('express');
const rateLimit = require('express-rate-limit');
const { auth } = require('../../shared/middleware/auth');
const validate = require('../../shared/middleware/validate');
const AppError = require('../../shared/errors/AppError');
const env = require('../../shared/config/env');
const schema = require('./transaction.schema');
const controller = require('./transaction.controller');

const router = express.Router();

// A separate, stricter limit for transfers: N attempts per customer per minute.
// It runs after auth, so the key is the customer id rather than the IP.
const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.transferRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.customerId),
  handler: (req, res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Too many transfer attempts, please try again later')),
});

router.post('/transactions/deposit', auth, schema.movement, validate, controller.deposit);
router.post('/transactions/withdraw', auth, schema.movement, validate, controller.withdraw);
router.post(
  '/transactions/transfer',
  auth,
  transferLimiter,
  schema.transfer,
  validate,
  controller.transfer
);
router.get('/accounts/:iban/statement', auth, schema.statement, validate, controller.statement);

module.exports = router;
