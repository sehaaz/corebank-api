const AppError = require('./AppError');

// PL/SQL tarafındaki RAISE_APPLICATION_ERROR kodları ve unique ihlali.
const MAP = {
  20001: [409, 'INSUFFICIENT_FUNDS', 'Yetersiz bakiye'],
  20002: [409, 'DAILY_LIMIT_EXCEEDED', 'Günlük transfer limiti aşıldı'],
  1: [409, 'DUPLICATE', 'Kayıt zaten mevcut'],
};

/** Oracle hatasını AppError'a çevirir; eşleşme yoksa null döner. */
function mapOracleError(err) {
  const entry = MAP[err && err.errorNum];
  if (!entry) return null;
  const [status, code, message] = entry;
  return new AppError(status, code, message);
}

module.exports = mapOracleError;
