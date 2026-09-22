const AppError = require('../../shared/errors/AppError');
const repo = require('./account.repository');

const BANK_CODE = '00061';
const RESERVED = '0';

// Faz 3'te fn_generate_iban'a taşınacak.
function generateIban(accountId) {
  const bban = BANK_CODE + RESERVED + String(accountId).padStart(16, '0');
  const rearranged = `${bban}TR00`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of rearranged) remainder = (remainder * 10 + Number(digit)) % 97;
  return `TR${String(98 - remainder).padStart(2, '0')}${bban}`;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function open(conn, customerId, currency) {
  const id = await repo.nextId(conn);
  const iban = generateIban(id);
  await repo.insert(conn, { id, customerId, iban, currency });
  return { id, iban, currency, balance: 0, status: 'ACTIVE' };
}

async function listSummaries(conn, customerId) {
  return repo.findSummariesByCustomer(conn, customerId);
}

async function getByIban(conn, iban) {
  const account = await repo.findByIban(conn, iban);
  if (!account) {
    throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Hesap bulunamadı');
  }
  return account;
}

async function assertOwnership(conn, iban, customerId) {
  const account = await getByIban(conn, iban);
  if (account.customerId !== customerId) {
    throw new AppError(403, 'FORBIDDEN', 'Bu hesap size ait değil');
  }
  return account;
}

async function assertActive(conn, iban) {
  const account = await getByIban(conn, iban);
  if (account.status !== 'ACTIVE') {
    throw new AppError(409, 'ACCOUNT_NOT_ACTIVE', 'Hesap işleme kapalı');
  }
  return account;
}

/** Satırı FOR UPDATE ile kilitler, bakiyeyi günceller, yeni bakiyeyi döner. */
async function adjustBalance(conn, iban, delta) {
  const account = await repo.lockByIban(conn, iban);
  if (!account) {
    throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Hesap bulunamadı');
  }
  const balance = round2(account.balance + delta);
  if (balance < 0) {
    throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Yetersiz bakiye');
  }
  await repo.updateBalance(conn, account.id, balance);
  return balance;
}

async function changeStatus(conn, iban, status) {
  const account = await getByIban(conn, iban);
  if (status === 'CLOSED' && account.balance !== 0) {
    throw new AppError(409, 'ACCOUNT_NOT_EMPTY', 'Bakiyesi olan hesap kapatılamaz');
  }
  await repo.updateStatus(conn, iban, status);
  return { ...account, status };
}

module.exports = {
  open, listSummaries, getByIban, assertOwnership, assertActive, adjustBalance, changeStatus,
};
