// The only public surface of this module. Other modules require this file and nothing else.
const svc = require('./account.service');

module.exports = {
  router: require('./account.routes'),
  getByIban:       (conn, iban) => svc.getByIban(conn, iban),
  assertOwnership: (conn, iban, customerId) => svc.assertOwnership(conn, iban, customerId),
  assertActive:    (conn, iban) => svc.assertActive(conn, iban),
  adjustBalance:   (conn, iban, delta) => svc.adjustBalance(conn, iban, delta),
};
