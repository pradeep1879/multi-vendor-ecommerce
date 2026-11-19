export type ToastKind = 'success' | 'error' | 'info';

export function showToast(message: string, kind: ToastKind = 'info') {
  if (!message.trim()) return;
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, kind } }));
}

export function getErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: unknown } } } })
      .response;
    if (typeof response?.data?.error?.message === 'string') return response.data.error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
