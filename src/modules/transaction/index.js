// The only public surface of this module. No other module depends on transaction.
module.exports = {
  router: require('./transaction.routes'),
};
