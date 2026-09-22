
function toAccount(row) {
  if (!row) return null;
  return {
    id: row.ID,
    customerId: row.CUSTOMER_ID,
    iban: row.IBAN,
    currency: row.CURRENCY,
    balance: row.BALANCE,
    dailyLimit: row.DAILY_LIMIT,
    status: row.STATUS,
    createdAt: row.CREATED_AT,
  };
}

async function nextId(conn) {
  const result = await conn.execute(`SELECT SEQ_ACCOUNTS.NEXTVAL AS ID FROM DUAL`);
  return result.rows[0].ID;
}

/** IBAN generation lives in PL/SQL (fn_generate_iban). */
async function generateIban(conn, id) {
  const result = await conn.execute(
    `SELECT fn_generate_iban(:id) AS IBAN FROM DUAL`,
    { id }
  );
  return result.rows[0].IBAN;
}

async function insert(conn, { id, customerId, iban, currency }) {
  await conn.execute(
    `INSERT INTO ACCOUNTS (id, customer_id, iban, currency)
     VALUES (:id, :customerId, :iban, :currency)`,
    { id, customerId, iban, currency }
  );
}

async function findByIban(conn, iban) {
  const result = await conn.execute(
    `SELECT id, customer_id, iban, currency, balance, daily_limit, status, created_at
     FROM ACCOUNTS WHERE iban = :iban`,
    { iban }
  );
  return toAccount(result.rows[0]);
}

/** Locks the row; must not be used outside adjustBalance. */
async function lockByIban(conn, iban) {
  const result = await conn.execute(
    `SELECT id, customer_id, iban, currency, balance, daily_limit, status, created_at
     FROM ACCOUNTS WHERE iban = :iban FOR UPDATE`,
    { iban }
  );
  return toAccount(result.rows[0]);
}

async function updateBalance(conn, id, balance) {
  await conn.execute(
    `UPDATE ACCOUNTS SET balance = :balance WHERE id = :id`,
    { id, balance }
  );
}

async function updateStatus(conn, iban, status) {
  await conn.execute(
    `UPDATE ACCOUNTS SET status = :status WHERE iban = :iban`,
    { iban, status }
  );
}

async function findSummariesByCustomer(conn, customerId) {
  const result = await conn.execute(
    `SELECT id, iban, currency, balance, full_name, tx_count, last_tx
     FROM V_ACCOUNT_SUMMARY WHERE customer_id = :customerId ORDER BY id`,
    { customerId }
  );
  return result.rows.map((row) => ({
    id: row.ID,
    iban: row.IBAN,
    currency: row.CURRENCY,
    balance: row.BALANCE,
    fullName: row.FULL_NAME,
    txCount: row.TX_COUNT,
    lastTx: row.LAST_TX,
  }));
}

module.exports = {
  nextId, generateIban, insert, findByIban, lockByIban, updateBalance, updateStatus,
  findSummariesByCustomer,
};
