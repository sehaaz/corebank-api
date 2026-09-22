const AppError = require('../../shared/errors/AppError');
const repo = require('./account.repository');

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function open(conn, customerId, currency) {
  const id = await repo.nextId(conn);
  const iban = await repo.generateIban(conn, id);
  await repo.insert(conn, { id, customerId, iban, currency });
  return { id, iban, currency, balance: 0, status: 'ACTIVE' };
}

async function listSummaries(conn, customerId) {
  return repo.findSummariesByCustomer(conn, customerId);
}

async function getByIban(conn, iban) {
  const account = await repo.findByIban(conn, iban);
  if (!account) {
    throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
  }
  return account;
}

async function assertOwnership(conn, iban, customerId) {
  const account = await getByIban(conn, iban);
  if (account.customerId !== customerId) {
    throw new AppError(403, 'FORBIDDEN', 'You do not own this account');
  }
  return account;
}

async function assertActive(conn, iban) {
  const account = await getByIban(conn, iban);
  if (account.status !== 'ACTIVE') {
    throw new AppError(409, 'ACCOUNT_NOT_ACTIVE', 'Account is not active');
  }
  return account;
}

/** Locks the row with FOR UPDATE, applies the delta and returns the new balance. */
async function adjustBalance(conn, iban, delta) {
  const account = await repo.lockByIban(conn, iban);
  if (!account) {
    throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
  }
  const balance = round2(account.balance + delta);
  if (balance < 0) {
    throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Insufficient funds');
  }
  await repo.updateBalance(conn, account.id, balance);
  return balance;
}

async function changeStatus(conn, iban, status) {
  const account = await getByIban(conn, iban);
  if (status === 'CLOSED' && account.balance !== 0) {
    throw new AppError(409, 'ACCOUNT_NOT_EMPTY', 'An account with a non-zero balance cannot be closed');
  }
  await repo.updateStatus(conn, iban, status);
  return { ...account, status };
}

module.exports = {
  open, listSummaries, getByIban, assertOwnership, assertActive, adjustBalance, changeStatus,
};
