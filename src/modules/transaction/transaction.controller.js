const withTransaction = require('../../shared/db/withTransaction');
const svc = require('./transaction.service');

function movement(handler) {
  return async (req, res, next) => {
    try {
      const { iban, amount, description } = req.body;
      const result = await withTransaction((conn) =>
        handler(conn, { iban, amount, description, customerId: req.user.customerId })
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };
}

/** Sadece tarih verilmişse günün tamamını kapsa diye üst sınır ertesi güne alınır. */
function parseTo(value) {
  if (!value) return null;
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

async function statement(req, res, next) {
  try {
    const result = await withTransaction((conn) =>
      svc.statement(conn, {
        iban: req.params.iban,
        customerId: req.user.customerId,
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

module.exports = {
  deposit: movement(svc.deposit),
  withdraw: movement(svc.withdraw),
  statement,
};
