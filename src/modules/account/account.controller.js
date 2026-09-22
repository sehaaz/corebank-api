const withTransaction = require('../../shared/db/withTransaction');
const svc = require('./account.service');

async function open(req, res, next) {
  try {
    const account = await withTransaction((conn) =>
      svc.open(conn, req.user.customerId, req.body.currency)
    );
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    res.json(await withTransaction((conn) => svc.listSummaries(conn, req.user.customerId)));
  } catch (err) {
    next(err);
  }
}

async function detail(req, res, next) {
  try {
    res.json(
      await withTransaction((conn) =>
        svc.assertOwnership(conn, req.params.iban, req.user.customerId)
      )
    );
  } catch (err) {
    next(err);
  }
}

async function changeStatus(req, res, next) {
  try {
    res.json(
      await withTransaction((conn) => svc.changeStatus(conn, req.params.iban, req.body.status))
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { open, list, detail, changeStatus };
