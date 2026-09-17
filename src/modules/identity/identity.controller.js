const withTransaction = require('../../shared/db/withTransaction');
const svc = require('./identity.service');

async function register(req, res, next) {
  try {
    const { nationalId, fullName, email, password } = req.body;
    res.status(201).json(await svc.register({ nationalId, fullName, email, password }));
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    res.json(await svc.login({ email, password }));
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    res.json(await withTransaction((conn) => svc.getById(conn, req.user.customerId)));
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
