const { query } = require('express-validator');

const list = [
  query('table').optional().isIn(['ACCOUNTS']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('size').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = { list };
