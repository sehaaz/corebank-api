function toRate(row) {
  return {
    baseCurrency: row.BASE_CURRENCY,
    targetCurrency: row.TARGET_CURRENCY,
    rate: row.RATE,
    updatedAt: row.UPDATED_AT,
  };
}

async function findAll(conn) {
  const result = await conn.execute(
    `SELECT base_currency, target_currency, rate, updated_at
     FROM EXCHANGE_RATES
     ORDER BY base_currency, target_currency`
  );
  return result.rows.map(toRate);
}

async function findRate(conn, baseCurrency, targetCurrency) {
  const result = await conn.execute(
    `SELECT rate FROM EXCHANGE_RATES
     WHERE base_currency = :baseCurrency AND target_currency = :targetCurrency`,
    { baseCurrency, targetCurrency }
  );
  return result.rows[0] ? result.rows[0].RATE : null;
}

module.exports = { findAll, findRate };
