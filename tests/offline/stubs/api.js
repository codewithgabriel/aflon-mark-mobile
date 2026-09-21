// Scriptable stand-in for the network layer.
class APIError extends Error {
  constructor(message, status, code, payload) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}
const state = { handler: async () => ({ message: 'ok' }), calls: [] };
exports.APIError = APIError;
exports.fetchAPI = async (endpoint, options = {}) => {
  const body = options.body ? JSON.parse(options.body) : null;
  state.calls.push({ endpoint, body });
  return state.handler(endpoint, body);
};
exports.__state = state;
exports.isNetworkFailure = (e) => e instanceof APIError && (e.status === 0 || e.status >= 500);
