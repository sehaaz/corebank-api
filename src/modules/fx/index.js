// The only public surface of this module. Other modules require this file and nothing else.
const svc = require('./fx.service');

module.exports = {
  router: require('./fx.routes'),
  getRate: (conn, from, to) => svc.getRate(conn, from, to),
};
