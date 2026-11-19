const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

type ApiEnvelope<T> = {
  data?: T;
  meta?: { page?: number; pageSize?: number; total?: number };
  error?: {
    message?: string;
    requestId?: string;
    details?: Array<{ field: string; issue: string }>;
  };
};

function apiErrorMessage(error: ApiEnvelope<never>['error'], fallback: string): string {
  const message = error?.message ?? fallback;
  const details = error?.details?.map(({ field, issue }) => {
    const name =
      field
        .replace(/^body\./, '')
        .split('.')
        .at(-1) ?? field;
    if (name === 'password' && issue.includes('12'))
      return 'Password must be at least 12 characters.';
    return `${name}: ${issue}`;
  });
  return details?.length ? `${message} ${details.join(' ')}` : message;
}

async function request<T>(
  path: string,
  token = '',
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return { data: undefined as T };
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || body.data === undefined)
    throw new Error(apiErrorMessage(body.error, 'The request could not be completed.'));
  return body;
}

export async function api<T>(path: string, token = '', init: RequestInit = {}): Promise<T> {
  return (await request<T>(path, token, init)).data as T;
}

export async function apiWithMeta<T>(
  path: string,
  token = '',
  init: RequestInit = {},
): Promise<{ data: T; meta?: ApiEnvelope<T>['meta'] }> {
  const response = await request<T>(path, token, init);
  return { data: response.data as T, meta: response.meta };
}

export async function apiDownload(path: string, token: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = (await response.json()) as ApiEnvelope<never>;
    throw new Error(apiErrorMessage(body.error, 'The file could not be downloaded.'));
  }
  return response.blob();
}

export function formatPaise(value: string | bigint): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    Number(value) / 100,
  );
}
