// In-memory stand-in for @react-native-async-storage/async-storage.
// run.mjs installs this into the scratch build as the real module's entry point.
const store = new Map();
exports.__esModule = true;
exports.__store = store;
exports.default = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => void store.set(k, v),
  removeItem: async (k) => void store.delete(k),
  clear: async () => store.clear(),
};
