const oracledb = require('oracledb');

function toTransaction(row) {
  return {
    id: row.ID,
    counterIban: row.COUNTER_IBAN,
    type: row.TYPE,
    amount: row.AMOUNT,
    balanceAfter: row.BALANCE_AFTER,
    referenceNo: row.REFERENCE_NO,
    description: row.DESCRIPTION,
    createdAt: row.CREATED_AT,
  };
}

const TS = oracledb.DB_TYPE_TIMESTAMP;

/**
 * pkg_transfer.do_transfer çağrısı. Prosedür iki hesabı kilitler, kaydı yazar
 * ve kendi COMMIT'ini atar; burada commit/rollback yapılmaz.
 */
async function callTransfer(conn, { fromIban, toIban, amount, description }) {
  const result = await conn.execute(
    `BEGIN pkg_transfer.do_transfer(:fromIban, :toIban, :amount, :description, :reference); END;`,
    {
      fromIban,
      toIban,
      amount,
      description,
      reference: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 36 },
    }
  );
  return result.outBinds.reference;
}

async function insert(conn, tx) {
  const result = await conn.execute(
    `INSERT INTO TRANSACTIONS
       (id, account_id, counter_iban, type, amount, balance_after, reference_no, description)
     VALUES
       (SEQ_TRANSACTIONS.NEXTVAL, :accountId, :counterIban, :type, :amount, :balanceAfter,
        :referenceNo, :description)
     RETURNING id, created_at INTO :id, :createdAt`,
    {
      accountId: tx.accountId,
      counterIban: tx.counterIban,
      type: tx.type,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      referenceNo: tx.referenceNo,
      description: tx.description,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      createdAt: { dir: oracledb.BIND_OUT, type: TS },
    }
  );
  return { id: result.outBinds.id[0], createdAt: result.outBinds.createdAt[0] };
}

async function countByAccount(conn, accountId, { from, to }) {
  const result = await conn.execute(
    `SELECT COUNT(*) AS TOTAL FROM TRANSACTIONS
     WHERE account_id = :accountId
       AND (:fromDate IS NULL OR created_at >= :fromDate)
       AND (:toDate   IS NULL OR created_at <  :toDate)`,
    { accountId, fromDate: { val: from, type: TS }, toDate: { val: to, type: TS } }
  );
  return result.rows[0].TOTAL;
}

async function findByAccount(conn, accountId, { from, to, offset, limit }) {
  const result = await conn.execute(
    `SELECT id, counter_iban, type, amount, balance_after, reference_no, description, created_at
     FROM TRANSACTIONS
     WHERE account_id = :accountId
       AND (:fromDate IS NULL OR created_at >= :fromDate)
       AND (:toDate   IS NULL OR created_at <  :toDate)
     ORDER BY created_at DESC, id DESC
     OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    {
      accountId,
      fromDate: { val: from, type: TS },
      toDate: { val: to, type: TS },
      offset,
      limit,
    }
  );
  return result.rows.map(toTransaction);
}

module.exports = { callTransfer, insert, countByAccount, findByAccount };
