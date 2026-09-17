const oracledb = require('oracledb');

function toCustomer(row) {
  if (!row) return null;
  return {
    id: row.ID,
    nationalId: row.NATIONAL_ID,
    fullName: row.FULL_NAME,
    email: row.EMAIL,
    role: row.ROLE,
    createdAt: row.CREATED_AT,
  };
}

async function insert(conn, { nationalId, fullName, email, passwordHash }) {
  const result = await conn.execute(
    `INSERT INTO CUSTOMERS (id, national_id, full_name, email, password_hash)
     VALUES (SEQ_CUSTOMERS.NEXTVAL, :nationalId, :fullName, :email, :passwordHash)
     RETURNING id, role INTO :id, :role`,
    {
      nationalId,
      fullName,
      email,
      passwordHash,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      role: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
    }
  );
  return { id: result.outBinds.id[0], role: result.outBinds.role[0] };
}

/** Parola hash'ini de döner — yalnızca login için. */
async function findCredentialsByEmail(conn, email) {
  const result = await conn.execute(
    `SELECT id, role, password_hash FROM CUSTOMERS WHERE email = :email`,
    { email }
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.ID, role: row.ROLE, passwordHash: row.PASSWORD_HASH };
}

async function findById(conn, id) {
  const result = await conn.execute(
    `SELECT id, national_id, full_name, email, role, created_at
     FROM CUSTOMERS WHERE id = :id`,
    { id }
  );
  return toCustomer(result.rows[0]);
}

module.exports = { insert, findCredentialsByEmail, findById };
