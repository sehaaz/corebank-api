const { getConnection } = require('./pool');

/**
 * Transaction sınırı burada açılır. fn'e verilen conn, çağrılan modüllerin
 * public fonksiyonlarına parametre olarak geçirilir; repository'ler kendi
 * başına commit/rollback yapmaz.
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
