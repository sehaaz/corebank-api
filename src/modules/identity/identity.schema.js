const { body } = require('express-validator');

const register = [
  body('nationalId').isString().matches(/^\d{11}$/).withMessage('TC kimlik no 11 haneli olmalı'),
  body('fullName').isString().trim().isLength({ min: 3, max: 100 }),
  body('email').isEmail().isLength({ max: 100 }).normalizeEmail(),
  body('password').isString().isLength({ min: 8, max: 72 }),
];

const login = [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().notEmpty(),
];

module.exports = { register, login };
