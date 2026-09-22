const AppError = require('./AppError');

// RAISE_APPLICATION_ERROR codes raised by PL/SQL, plus unique constraint violations.
const MAP = {
  20001: [409, 'INSUFFICIENT_FUNDS', 'Insufficient funds'],
  20002: [409, 'DAILY_LIMIT_EXCEEDED', 'Daily transfer limit exceeded'],
  20003: [409, 'SAME_ACCOUNT', 'Sender and receiver accounts must differ'],
  20004: [409, 'ACCOUNT_NOT_ACTIVE', 'Account is not active'],
  20005: [409, 'RATE_NOT_FOUND', 'Exchange rate not found'],
  20006: [404, 'ACCOUNT_NOT_FOUND', 'Account not found'],
  1: [409, 'DUPLICATE', 'Record already exists'],
};

/** Maps an Oracle error to an AppError; returns null when there is no match. */
function mapOracleError(err) {
  const entry = MAP[err && err.errorNum];
  if (!entry) return null;
  const [status, code, message] = entry;
  return new AppError(status, code, message);
}

module.exports = mapOracleError;
