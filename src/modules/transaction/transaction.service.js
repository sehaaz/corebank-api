const { randomUUID } = require('node:crypto');
const account = require('../account');
const { getConnection } = require('../../shared/db/pool');
const AppError = require('../../shared/errors/AppError');
const repo = require('./transaction.repository');

/** Money validation is repeated here; it is never relaxed by trusting the schema layer. */
function assertAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be positive');
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount cannot have more than 2 decimal places');
  }
}

async function move(conn, { iban, amount, description, customerId, type }) {
  assertAmount(amount);

  await account.assertOwnership(conn, iban, customerId);
  const acc = await account.assertActive(conn, iban);

  if (type === 'WITHDRAW' && acc.balance < amount) {
    throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Insufficient funds');
  }

  const delta = type === 'WITHDRAW' ? -amount : amount;
  const balanceAfter = await account.adjustBalance(conn, iban, delta);

  const referenceNo = randomUUID();
  const { id, createdAt } = await repo.insert(conn, {
    accountId: acc.id,
    counterIban: null,
    type,
    amount,
    balanceAfter,
    referenceNo,
    description: description || null,
  });

  return { id, type, amount, balanceAfter, referenceNo, description: description || null, createdAt };
}

async function deposit(conn, params) {
  return move(conn, { ...params, type: 'DEPOSIT' });
}

async function withdraw(conn, params) {
  return move(conn, { ...params, type: 'WITHDRAW' });
}

/**
 * Transfers run inside pkg_transfer.do_transfer. The procedure locks both
 * accounts in IBAN order, writes both ledger legs and issues its own COMMIT.
 * That is why withTransaction is NOT used here: wrapping the call would add a
 * second commit on top of the procedure's. Only the connection is acquired and
 * released.
 */
async function transfer({ fromIban, toIban, amount, description, customerId }) {
  assertAmount(amount);

  const conn = await getConnection();
  try {
    // Ownership is verified against the database; knowing the IBAN is not enough.
    await account.assertOwnership(conn, fromIban, customerId);

    const referenceNo = await repo.callTransfer(conn, {
      fromIban,
      toIban,
      amount,
      description: description || null,
    });

    return { referenceNo, fromIban, toIban, amount, description: description || null };
  } finally {
    await conn.close();
  }
}

async function statement(conn, { iban, customerId, from, to, page, size }) {
  const acc = await account.assertOwnership(conn, iban, customerId);
  const range = { from, to };
  const total = await repo.countByAccount(conn, acc.id, range);
  const items = await repo.findByAccount(conn, acc.id, {
    ...range,
    offset: (page - 1) * size,
    limit: size,
  });
  return { page, size, total, items };
}

module.exports = { deposit, withdraw, transfer, statement };
