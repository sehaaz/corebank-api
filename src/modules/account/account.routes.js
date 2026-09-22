const express = require('express');
const { auth, requireRole } = require('../../shared/middleware/auth');
const validate = require('../../shared/middleware/validate');
const schema = require('./account.schema');
const controller = require('./account.controller');

const router = express.Router();

router.post('/accounts', auth, schema.open, validate, controller.open);
router.get('/accounts', auth, controller.list);
router.get('/accounts/:iban', auth, schema.detail, validate, controller.detail);
router.patch(
  '/accounts/:iban/status',
  auth,
  requireRole('TELLER'),
  schema.changeStatus,
  validate,
  controller.changeStatus
);

module.exports = router;
