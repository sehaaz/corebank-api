const oracledb = require('oracledb');
const env = require('../config/env');
const logger = require('../logger');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

async function initPool() {
  await oracledb.createPool({
    user: env.db.user,
    password: env.db.password,
    connectString: env.db.connectString,
    poolMin: 2,
    poolMax: 10,
  });
  logger.info('Oracle connection pool ready');
}

async function getConnection() {
  return oracledb.getConnection();
}

async function closePool() {
  await oracledb.getPool().close(10);
  logger.info('Oracle connection pool closed');
}

module.exports = { initPool, getConnection, closePool };
