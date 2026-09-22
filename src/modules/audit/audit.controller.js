const withTransaction = require('../../shared/db/withTransaction');
const svc = require('./audit.service');

/** Sadece tarih verilmişse günün tamamını kapsa diye üst sınır ertesi güne alınır. */
function parseTo(value) {
  if (!value) return null;
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

async function list(req, res, next) {
  try {
    const result = await withTransaction((conn) =>
      svc.list(conn, {
        tableName: req.query.table || null,
        from: req.query.from ? new Date(req.query.from) : null,
        to: parseTo(req.query.to),
        page: req.query.page || 1,
        size: req.query.size || 20,
      })
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
