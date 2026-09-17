const express = require('express');
const { auth } = require('../../shared/middleware/auth');
const validate = require('../../shared/middleware/validate');
const schema = require('./identity.schema');
const controller = require('./identity.controller');

const router = express.Router();

router.post('/auth/register', schema.register, validate, controller.register);
router.post('/auth/login', schema.login, validate, controller.login);
router.get('/customers/me', auth, controller.me);

module.exports = router;
