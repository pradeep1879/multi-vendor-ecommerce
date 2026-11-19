import axios from 'axios';

export function errorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError<{ error?: { code?: string; message?: string } }>(error)) return fallback;
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'The sign-in request timed out. Check your connection and try again.';
  }
  if (import.meta.env.DEV && error.response?.data?.error?.code === 'AUTH_ORIGIN_INVALID') {
    return 'Open the storefront at the exact origin allowed by the backend CORS configuration and try again.';
  }
  return error.response?.data?.error?.message ?? fallback;
}
