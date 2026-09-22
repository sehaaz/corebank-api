const oracledb = require('oracledb');

const TS = oracledb.DB_TYPE_TIMESTAMP;

function toEntry(row) {
  return {
    id: row.ID,
    tableName: row.TABLE_NAME,
    recordId: row.RECORD_ID,
    action: row.ACTION,
    oldValue: row.OLD_VALUE,
    newValue: row.NEW_VALUE,
    createdAt: row.CREATED_AT,
  };
}

async function countAll(conn, { tableName, from, to }) {
  const result = await conn.execute(
    `SELECT COUNT(*) AS TOTAL FROM AUDIT_LOG
     WHERE (:tableName IS NULL OR table_name = :tableName)
       AND (:fromDate  IS NULL OR created_at >= :fromDate)
       AND (:toDate    IS NULL OR created_at <  :toDate)`,
    { tableName, fromDate: { val: from, type: TS }, toDate: { val: to, type: TS } }
  );
  return result.rows[0].TOTAL;
}

async function findAll(conn, { tableName, from, to, offset, limit }) {
  const result = await conn.execute(
    `SELECT id, table_name, record_id, action, old_value, new_value, created_at
     FROM AUDIT_LOG
     WHERE (:tableName IS NULL OR table_name = :tableName)
       AND (:fromDate  IS NULL OR created_at >= :fromDate)
       AND (:toDate    IS NULL OR created_at <  :toDate)
     ORDER BY created_at DESC, id DESC
     OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    {
      tableName,
      fromDate: { val: from, type: TS },
      toDate: { val: to, type: TS },
      offset,
      limit,
    }
  );
  return result.rows.map(toEntry);
}

module.exports = { countAll, findAll };
