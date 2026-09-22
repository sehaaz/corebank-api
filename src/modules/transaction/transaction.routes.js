const express = require('express');
const rateLimit = require('express-rate-limit');
const { auth } = require('../../shared/middleware/auth');
const validate = require('../../shared/middleware/validate');
const AppError = require('../../shared/errors/AppError');
const schema = require('./transaction.schema');
const controller = require('./transaction.controller');

const router = express.Router();

// Transfer için ayrı ve sıkı limit: müşteri başına dakikada 5 deneme.
// auth'tan sonra çalıştığı için anahtar IP değil customerId.
const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.customerId),
  handler: (req, res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Çok fazla transfer denemesi, sonra tekrar deneyin')),
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
