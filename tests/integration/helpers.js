// Integration tests run against a real Oracle instance.
// Each test seeds its own data and removes it afterwards.
process.env.TRANSFER_RATE_LIMIT = process.env.TRANSFER_RATE_LIMIT || '1000';

const jwt = require('jsonwebtoken');
const oracledb = require('oracledb');
const env = require('../../src/shared/config/env');
const { initPool, getConnection, closePool } = require('../../src/shared/db/pool');

/** Unique suffix so parallel test files cannot collide on unique columns. */
let counter = 0;
function unique() {
  counter += 1;
  return `${String(process.pid).slice(-4)}${String(Date.now()).slice(-5)}${counter}`;
}

async function createCustomer(conn, role = 'CUSTOMER') {
  const suffix = unique();
  const nationalId = suffix.padStart(11, '9').slice(-11);
  const email = `it${suffix}@test.local`;
  const result = await conn.execute(
    `INSERT INTO CUSTOMERS (id, national_id, full_name, email, password_hash, role)
     VALUES (SEQ_CUSTOMERS.NEXTVAL, :nationalId, :fullName, :email, :hash, :role)
     RETURNING id INTO :id`,
    {
      nationalId,
      fullName: 'Integration Test',
      email,
      hash: 'x',
      role,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    }
  );
  return result.outBinds.id[0];
}

async function createAccount(conn, customerId, currency, balance) {
  const idRes = await conn.execute('SELECT SEQ_ACCOUNTS.NEXTVAL AS ID FROM DUAL');
  const id = idRes.rows[0].ID;
  const ibanRes = await conn.execute('SELECT fn_generate_iban(:id) AS IBAN FROM DUAL', { id });
  const iban = ibanRes.rows[0].IBAN;
  await conn.execute(
    `INSERT INTO ACCOUNTS (id, customer_id, iban, currency, balance)
     VALUES (:id, :customerId, :iban, :currency, :balance)`,
    { id, customerId, iban, currency, balance }
  );
  return { id, iban };
}

async function balanceOf(conn, iban) {
  const result = await conn.execute('SELECT balance FROM ACCOUNTS WHERE iban = :iban', { iban });
  return result.rows[0].BALANCE;
}

async function transactionsOf(conn, accountId) {
  const result = await conn.execute(
    `SELECT type, amount, balance_after, reference_no
     FROM TRANSACTIONS WHERE account_id = :accountId ORDER BY id`,
    { accountId }
  );
  return result.rows.map((r) => ({
    type: r.TYPE,
    amount: r.AMOUNT,
    balanceAfter: r.BALANCE_AFTER,
    referenceNo: r.REFERENCE_NO,
  }));
}

/** Deletes the seeded rows in dependency order. */
async function cleanup(conn, { accountIds = [], customerIds = [] }) {
  for (const accountId of accountIds) {
    await conn.execute('DELETE FROM TRANSACTIONS WHERE account_id = :id', { id: accountId });
    await conn.execute(
      `DELETE FROM AUDIT_LOG WHERE table_name = 'ACCOUNTS' AND record_id = :id`,
      { id: accountId }
    );
  }
  for (const accountId of accountIds) {
    await conn.execute('DELETE FROM ACCOUNTS WHERE id = :id', { id: accountId });
  }
  for (const customerId of customerIds) {
    await conn.execute('DELETE FROM CUSTOMERS WHERE id = :id', { id: customerId });
  }
  await conn.commit();
}

function tokenFor(customerId, role = 'CUSTOMER') {
  return jwt.sign({ customerId, role }, env.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: '15m',
  });
}

module.exports = {
  initPool,
  closePool,
  getConnection,
  createCustomer,
  createAccount,
  balanceOf,
  transactionsOf,
  cleanup,
  tokenFor,
};
