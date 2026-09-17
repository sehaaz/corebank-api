const express = require('express');
const helmet = require('helmet');
const identity = require('./modules/identity');
const AppError = require('./shared/errors/AppError');
const errorHandler = require('./shared/middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', identity.router);
// account, transaction, fx, audit router'ları buraya mount edilecek.

app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint bulunamadı')));
app.use(errorHandler);

module.exports = app;
