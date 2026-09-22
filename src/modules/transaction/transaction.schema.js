const { body, param, query } = require('express-validator');

const twoDecimals = (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;

const movement = [
  body('iban').matches(/^TR\d{24}$/).withMessage('Geçersiz IBAN'),
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Tutar pozitif olmalı')
    .custom(twoDecimals)
    .withMessage('Tutar en fazla 2 ondalık olabilir')
    .toFloat(),
  body('description').optional({ values: 'falsy' }).isString().isLength({ max: 200 }),
];

const statement = [
  param('iban').matches(/^TR\d{24}$/).withMessage('Geçersiz IBAN'),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('size').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = { movement, statement };
