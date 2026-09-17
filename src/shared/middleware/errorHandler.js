const AppError = require('../errors/AppError');
const mapOracleError = require('../errors/oracleErrorMap');
const logger = require('../logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const appError = err instanceof AppError ? err : mapOracleError(err);

  if (appError) {
    return res.status(appError.status).json({
      error: appError.code,
      message: appError.message,
      status: appError.status,
    });
  }

  // Beklenmeyen hata: detay yalnızca log'a, client'a sızdırılmaz.
  logger.error(`${req.method} ${req.path} beklenmeyen hata`, {
    message: err.message,
    stack: err.stack,
  });
  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Beklenmeyen bir hata oluştu',
    status: 500,
  });
}

module.exports = errorHandler;
