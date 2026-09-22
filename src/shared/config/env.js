require('dotenv').config();

const REQUIRED = ['DB_USER', 'DB_PASSWORD', 'DB_CONNECT_STRING', 'JWT_SECRET'];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = {
  db: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '15m',
  },
  port: Number(process.env.PORT) || 3000,
  // Per-minute limit for the transfer endpoint. Defaults to 5; the integration
  // tests raise it so the concurrency scenario is not throttled.
  transferRateLimit: Number(process.env.TRANSFER_RATE_LIMIT) || 5,
};
