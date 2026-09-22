const repo = require('./audit.repository');

async function list(conn, { tableName, from, to, page, size }) {
  const filter = { tableName, from, to };
  const total = await repo.countAll(conn, filter);
  const items = await repo.findAll(conn, { ...filter, offset: (page - 1) * size, limit: size });
  return { page, size, total, items };
}

module.exports = { list };
