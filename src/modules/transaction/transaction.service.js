const { randomUUID } = require('node:crypto');
const account = require('../account');
const { getConnection } = require('../../shared/db/pool');
const AppError = require('../../shared/errors/AppError');
const repo = require('./transaction.repository');

/** Para doğrulaması burada da yapılır; schema katmanına güvenip kısılmaz. */
function assertAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Tutar pozitif olmalı');
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-9) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Tutar en fazla 2 ondalık olabilir');
  }
}

async function move(conn, { iban, amount, description, customerId, type }) {
  assertAmount(amount);

  await account.assertOwnership(conn, iban, customerId);
  const acc = await account.assertActive(conn, iban);

  if (type === 'WITHDRAW' && acc.balance < amount) {
    throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Yetersiz bakiye');
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
 * Transfer, pkg_transfer.do_transfer içinde yapılır. Prosedür iki hesabı
 * IBAN sırasına göre kilitler, iki bacağı da yazar ve kendi COMMIT'ini atar.
 * Bu yüzden burada withTransaction KULLANILMAZ — sarmalanırsa prosedürün
 * commit'inin üstüne ikinci bir commit atılmış olurdu. Sadece bağlantı
 * alınır ve iş bitince kapatılır.
 */
async function transfer({ fromIban, toIban, amount, description, customerId }) {
  assertAmount(amount);

  const conn = await getConnection();
  try {
    // Sahiplik DB'den doğrulanır; IBAN'ı bilmek yetmez.
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
