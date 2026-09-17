const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../../shared/config/env');
const withTransaction = require('../../shared/db/withTransaction');
const AppError = require('../../shared/errors/AppError');
const repo = require('./identity.repository');

const BCRYPT_COST = 12;

async function register({ nationalId, fullName, email, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  // email / national_id çakışması UNIQUE constraint'ten ORA-00001 olarak gelir
  // ve errorHandler tarafından 409 DUPLICATE'e çevrilir.
  const { id, role } = await withTransaction((conn) =>
    repo.insert(conn, { nationalId, fullName, email, passwordHash })
  );
  return { id, nationalId, fullName, email, role };
}

async function login({ email, password }) {
  const found = await withTransaction((conn) => repo.findCredentialsByEmail(conn, email));
  const ok = found && (await bcrypt.compare(password, found.passwordHash));
  if (!ok) {
    throw new AppError(401, 'UNAUTHORIZED', 'E-posta veya parola hatalı');
  }
  const token = jwt.sign({ customerId: found.id, role: found.role }, env.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: env.jwt.expiresIn,
  });
  return { token };
}

async function getById(conn, id) {
  const customer = await repo.findById(conn, id);
  if (!customer) {
    throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı');
  }
  return customer;
}

module.exports = { register, login, getById };
