// The only public surface of this module. Other modules require this file and nothing else.
const svc = require('./identity.service');

module.exports = {
  router: require('./identity.routes'),
  getById: (conn, id) => svc.getById(conn, id),
};
