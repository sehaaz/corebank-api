// Dışarıya açılan tek yüzey. Başka modüller yalnız bunu require eder.
const svc = require('./identity.service');

module.exports = {
  router: require('./identity.routes'),
  getById: (conn, id) => svc.getById(conn, id),
};
