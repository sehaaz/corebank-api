const SECRET_KEYS = ['password', 'password_hash', 'passwordHash', 'token', 'authorization', 'jwt'];

/** TR33...1326 -> TR3300****1326 */
function maskIban(iban) {
  if (typeof iban !== 'string' || iban.length < 10) return '****';
  return `${iban.slice(0, 6)}****${iban.slice(-4)}`;
}

function redact(value) {
  if (!value || typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_KEYS.includes(key)) out[key] = '[REDACTED]';
    else if (key.toLowerCase().includes('iban')) out[key] = maskIban(val);
    else out[key] = redact(val);
  }
  return out;
}

function write(level, message, meta) {
  const line = `${new Date().toISOString()} ${level} ${message}`;
  if (meta === undefined) console.log(line);
  else console.log(line, JSON.stringify(redact(meta)));
}

module.exports = {
  info: (message, meta) => write('INFO', message, meta),
  warn: (message, meta) => write('WARN', message, meta),
  error: (message, meta) => write('ERROR', message, meta),
  maskIban,
};
