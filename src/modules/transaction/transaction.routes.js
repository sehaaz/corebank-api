const express = require('express');
const { auth } = require('../../shared/middleware/auth');
const validate = require('../../shared/middleware/validate');
const schema = require('./transaction.schema');
const controller = require('./transaction.controller');

const router = express.Router();

router.post('/transactions/deposit', auth, schema.movement, validate, controller.deposit);
router.post('/transactions/withdraw', auth, schema.movement, validate, controller.withdraw);
router.get('/accounts/:iban/statement', auth, schema.statement, validate, controller.statement);

module.exports = router;
