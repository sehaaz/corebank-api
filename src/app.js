const path = require('path');
const express = require('express');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const identity = require('./modules/identity');
const account = require('./modules/account');
const transaction = require('./modules/transaction');
const fx = require('./modules/fx');
const audit = require('./modules/audit');
const AppError = require('./shared/errors/AppError');
const errorHandler = require('./shared/middleware/errorHandler');

const app = express();

const DOCS_PATH = '/api-docs';
const OPENAPI_FILE = path.join(__dirname, '..', 'docs', 'openapi.yaml');

// Swagger UI bootstraps its page with an inline script, which helmet's default
// CSP blocks. Security headers are skipped for the documentation route only;
// every API route still gets the full set.
const securityHeaders = helmet();
app.use((req, res, next) =>
  (req.path.startsWith(DOCS_PATH) ? next() : securityHeaders(req, res, next))
);

app.use(express.json());

// The spec is served as raw YAML and parsed by Swagger UI in the browser,
// so no server-side YAML library is required.
app.get(`${DOCS_PATH}/openapi.yaml`, (req, res) =>
  res.type('text/yaml').sendFile(OPENAPI_FILE)
);
app.use(
  DOCS_PATH,
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerOptions: { url: `${DOCS_PATH}/openapi.yaml` },
    customSiteTitle: 'CoreBank API',
  })
);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', identity.router);
app.use('/api', account.router);
app.use('/api', transaction.router);
app.use('/api', fx.router);
app.use('/api', audit.router);

app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found')));
app.use(errorHandler);

module.exports = app;
