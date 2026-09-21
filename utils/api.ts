import Constants from 'expo-constants';

const getBaseUrl = () => {
  const configured = process.env.EXPO_PUBLIC_BACKEND_URL;
  const hostUri = Constants.expoConfig?.hostUri;

  if (configured) {
    if (configured.includes('localhost') && hostUri) {
      const ip = hostUri.split(':')[0];
      const portMatch = configured.match(/:(\d+)/);
      const port = portMatch ? portMatch[1] : '3000';
      const resolved = `http://${ip}:${port}`;
      console.log(`[API] Auto-corrected localhost to device host: ${resolved}`);
      return resolved;
    }
    return configured;
  }

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:3000`;
  }

  // In production builds (or when no dev host exists), default to live Vercel backend
  if (!__DEV__) {
    return 'https://aflon-mark-backend.vercel.app';
  }

  return 'http://localhost:3000';
};

const API_BASE_URL = getBaseUrl();
const API_SECRET_KEY = process.env.EXPO_PUBLIC_API_SECRET || 'supersecret_aflon_key_123';

export class APIError extends Error {
  status: number;
  /**
   * Machine-readable reason from the backend (see lib/attendance.js CODES).
   * The offline queue uses this to tell a scan that can be retried apart from
   * one that will be rejected forever.
   */
  code?: string;
  payload?: any;

  constructor(message: string, status: number, code?: string, payload?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

/** True when the request never got a usable answer out of the server. */
export const isNetworkFailure = (err: unknown): boolean =>
  err instanceof APIError && (err.status === 0 || err.status >= 500);

export const fetchAPI = async (endpoint: string, options: any = {}) => {
  const url = `${API_BASE_URL}/api${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_SECRET_KEY,
    ...(options.headers || {}),
  };

  // Network-level errors (no connection, timeout, aborted, DNS, …)
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkError: any) {
    // Being offline is a supported state, and the connectivity probe aborts on
    // purpose after its timeout — neither is a fault worth a red error log.
    const aborted =
      options.signal?.aborted ||
      networkError?.name === 'AbortError' ||
      /cancel/i.test(networkError?.message || '');

    if (!aborted) {
      console.warn(`[Offline] ${endpoint}: ${networkError?.message ?? 'request failed'}`);
    }
    throw new APIError('Network error — check your connection.', 0);
  }

  // A gateway or proxy can answer with HTML instead of JSON. Treat an
  // unparseable body as a server-side failure rather than crashing the caller.
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    if (response.ok) return null;
    throw new APIError(`Server returned ${response.status}.`, response.status);
  }

  if (!response.ok) {
    throw new APIError(data?.error || 'Something went wrong.', response.status, data?.code, data);
  }

  return data;
};
