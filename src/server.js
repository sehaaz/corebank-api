const app = require('./app');
const env = require('./shared/config/env');
const { initPool, closePool } = require('./shared/db/pool');
const logger = require('./shared/logger');

async function start() {
  await initPool();
  const server = app.listen(env.port, () => logger.info(`API dinliyor: ${env.port}`));

  const shutdown = async (signal) => {
    logger.info(`${signal} alındı, kapatılıyor`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Başlatma hatası', { message: err.message });
  process.exit(1);
});
