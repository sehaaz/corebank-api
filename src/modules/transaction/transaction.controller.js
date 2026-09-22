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

// Transfer is not wrapped in withTransaction: pkg_transfer.do_transfer issues
// its own COMMIT, so the service layer owns the connection instead.
async function transfer(req, res, next) {
  try {
    const { fromIban, toIban, amount, description } = req.body;
    const result = await svc.transfer({
      fromIban,
      toIban,
      amount,
      description,
      customerId: req.user.customerId,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** When only a date is given, the upper bound moves to the next day so the whole day is covered. */
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
  transfer,
  statement,
};
