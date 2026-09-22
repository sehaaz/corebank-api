// Dışarıya açılan tek yüzey. Başka modüller yalnız bunu require eder.
const svc = require('./fx.service');

module.exports = {
  router: require('./fx.routes'),
  getRate: (conn, from, to) => svc.getRate(conn, from, to),
};
