const express = require('express');
const { auth, requireRole } = require('../../shared/middleware/auth');
const validate = require('../../shared/middleware/validate');
const schema = require('./audit.schema');
const controller = require('./audit.controller');

const router = express.Router();

router.get('/audit', auth, requireRole('TELLER'), schema.list, validate, controller.list);

module.exports = router;
