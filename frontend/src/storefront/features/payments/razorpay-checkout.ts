export type RazorpayPaymentResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RazorpayFailure = { error?: { code?: string; description?: string } };

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: RazorpayPaymentResponse) => void;
  modal: { ondismiss: () => void };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: 'payment.failed', handler: (failure: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let razorpayScript: Promise<void> | undefined;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Checkout is unavailable.'));
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScript) return razorpayScript;

  razorpayScript = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.dataset.razorpayCheckout = 'true';
      document.body.appendChild(script);
    }
    const loaded = () =>
      window.Razorpay
        ? resolve()
        : reject(new Error('Razorpay Checkout could not be initialized.'));
    const failed = () =>
      reject(new Error('Could not load Razorpay Checkout. Check your connection and retry.'));
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (window.Razorpay) resolve();
  }).catch((error: unknown) => {
    razorpayScript = undefined;
    throw error;
  });
  return razorpayScript;
}

export function openRazorpayCheckout(options: RazorpayOptions): RazorpayInstance {
  if (!window.Razorpay) throw new Error('Razorpay Checkout is not ready. Please try again.');
  return new window.Razorpay(options);
}
