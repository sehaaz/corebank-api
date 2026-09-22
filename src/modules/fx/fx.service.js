const AppError = require('../../shared/errors/AppError');
const repo = require('./fx.repository');

async function list(conn) {
  return repo.findAll(conn);
}

async function getRate(conn, from, to) {
  if (from === to) return 1;
  const rate = await repo.findRate(conn, from, to);
  if (rate === null) {
    throw new AppError(409, 'RATE_NOT_FOUND', 'Kur bulunamadı');
  }
  return rate;
}

module.exports = { list, getRate };
