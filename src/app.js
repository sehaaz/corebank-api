const express = require('express');
const helmet = require('helmet');
const identity = require('./modules/identity');
const account = require('./modules/account');
const transaction = require('./modules/transaction');
const fx = require('./modules/fx');
const audit = require('./modules/audit');
const AppError = require('./shared/errors/AppError');
const errorHandler = require('./shared/middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', identity.router);
app.use('/api', account.router);
app.use('/api', transaction.router);
app.use('/api', fx.router);
app.use('/api', audit.router);

app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint bulunamadı')));
app.use(errorHandler);

module.exports = app;
