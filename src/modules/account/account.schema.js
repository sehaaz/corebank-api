const { body, param } = require('express-validator');

const ibanParam = param('iban').matches(/^TR\d{24}$/).withMessage('Geçersiz IBAN');

const open = [body('currency').isIn(['TRY', 'USD', 'EUR'])];

const detail = [ibanParam];

const changeStatus = [
  ibanParam,
  body('status').isIn(['ACTIVE', 'FROZEN', 'CLOSED']),
];

module.exports = { open, detail, changeStatus };
