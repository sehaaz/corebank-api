const withTransaction = require('../../shared/db/withTransaction');
const svc = require('./fx.service');

async function list(req, res, next) {
  try {
    res.json(await withTransaction((conn) => svc.list(conn)));
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
