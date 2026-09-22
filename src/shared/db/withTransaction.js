const { getConnection } = require('./pool');

/**
 * The transaction boundary is opened here. The connection handed to `fn` is
 * passed on to the public functions of any module it calls; repositories never
 * commit or roll back on their own.
 */
async function withTransaction(fn) {
  const conn = await getConnection();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.close();
  }
}

module.exports = withTransaction;
