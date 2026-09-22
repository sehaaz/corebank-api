// Dışarıya açılan tek yüzey. Hiçbir modül transaction'a bağımlı değildir.
module.exports = {
  router: require('./transaction.routes'),
};
