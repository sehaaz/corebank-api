const express = require('express');
const validate = require('../../shared/middleware/validate');
const schema = require('./fx.schema');
const controller = require('./fx.controller');

const router = express.Router();

router.get('/rates', schema.list, validate, controller.list);

module.exports = router;
