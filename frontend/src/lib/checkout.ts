import { api } from './api';

declare global {
  interface Window { Razorpay?: any }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay checkout'));
    document.body.appendChild(s);
  });
}

/** Activates any of the user's paid-but-unconfirmed orders. Returns how many were activated. */
export async function reconcilePayments(): Promise<number> {
  const { data } = await api.post<{ activated: number }>('/billing/reconcile');
  return data.activated;
}

export interface CheckoutInput { planCode: 'pro' | 'team' | 'seats'; cycle?: 'monthly' | 'yearly'; seats?: number }

/** Resolves true once the payment is verified server-side, false if the user closed checkout. */
export async function checkout(input: CheckoutInput): Promise<boolean> {
  const { data } = await api.post('/billing/checkout', input);

  if (data.devMode) {
    // Local dev without Razorpay keys: simulate a successful payment.
    if (!window.confirm(`Dev checkout: simulate paying ₹${data.amountInr} for ${data.planName}?`)) return false;
    await api.post('/billing/verify', { devPaymentId: data.paymentId });
    return true;
  }

  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: data.keyId,
      order_id: data.orderId,
      amount: data.amount,
      currency: data.currency,
      name: 'Resumint',
      description: data.planName,
      prefill: data.prefill,
      theme: { color: '#2F2A8C' },
      handler: async (resp: Record<string, string>) => {
        try {
          await api.post('/billing/verify', resp);
          resolve(true);
        } catch (e) {
          reject(e);
        }
      },
      // Closing the modal right after paying (before the handler ran) must not lose the purchase:
      // ask the server to check the order with Razorpay.
      modal: { ondismiss: () => reconcilePayments().then((n) => resolve(n > 0), () => resolve(false)) },
    });
    rzp.on('payment.failed', (r: any) => reject(new Error(r?.error?.description || 'Payment failed')));
    rzp.open();
  });
}
