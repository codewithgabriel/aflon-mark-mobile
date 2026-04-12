import Constants from 'expo-constants';

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) return process.env.EXPO_PUBLIC_BACKEND_URL;

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:3000`;
  }

  return 'http://localhost:3000';
};

const API_BASE_URL = getBaseUrl();
const API_SECRET_KEY = process.env.EXPO_PUBLIC_API_SECRET || 'supersecret_aflon_key_123';

export class APIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

export const fetchAPI = async (endpoint: string, options: any = {}) => {
  const url = `${API_BASE_URL}/api${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_SECRET_KEY,
    ...(options.headers || {}),
  };

  // Network-level errors (no connection, timeout, etc.)
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkError: any) {
    console.error(`[Network Error] ${endpoint}:`, networkError.message);
    throw new APIError('Network error — check your connection.', 0);
  }

  const data = await response.json();

  // API-level errors (4xx, 5xx) — known, expected, not a crash
  if (!response.ok) {
    const message = data?.error || 'Something went wrong.';
    throw new APIError(message, response.status);
  }

  return data;
};
