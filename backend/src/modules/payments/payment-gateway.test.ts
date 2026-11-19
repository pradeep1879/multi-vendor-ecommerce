import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { TestPaymentGateway } from './payment-gateway';

describe('local test payment gateway', () => {
  test('requires a server signature and returns only the created order amount as captured', async () => {
    const gateway = new TestPaymentGateway('test-payment-secret-with-more-than-32-characters');
    const order = await gateway.createOrder({
      amountPaise: 12_345n,
      currency: 'INR',
      receipt: 'local-test-receipt',
    });
    const paymentId = 'test_payment_1';
    const signature = createHmac('sha256', 'test-payment-secret-with-more-than-32-characters')
      .update(`${order.providerOrderId}|${paymentId}`)
      .digest('hex');

    expect(gateway.verifyCheckoutSignature(order.providerOrderId, paymentId, '0'.repeat(64))).toBe(
      false,
    );
    expect(gateway.verifyCheckoutSignature(order.providerOrderId, paymentId, signature)).toBe(true);
    await expect(gateway.fetchPayment(paymentId)).resolves.toMatchObject({
      amountPaise: 12_345n,
      currency: 'INR',
      status: 'captured',
    });
  });

  test('verifies webhook bytes before exposing a normalized captured event', () => {
    const secret = 'test-payment-secret-with-more-than-32-characters';
    const gateway = new TestPaymentGateway(secret);
    const raw = Buffer.from(
      JSON.stringify({
        event_type: 'payment.captured',
        payment: {
          order_id: 'test_order_1',
          id: 'test_payment_1',
          amount: 12345,
          currency: 'INR',
        },
      }),
    );
    const signature = createHmac('sha256', secret).update(raw).digest('hex');

    expect(gateway.verifyWebhookSignature(raw, '0'.repeat(64))).toBe(false);
    expect(gateway.verifyWebhookSignature(raw, signature)).toBe(true);
    expect(gateway.parseWebhook(raw)).toMatchObject({
      eventType: 'payment.captured',
      providerOrderId: 'test_order_1',
      providerPaymentId: 'test_payment_1',
      amountPaise: 12_345n,
      status: 'captured',
    });
  });

  test('normalizes authorization separately from capture', () => {
    const gateway = new TestPaymentGateway('test-payment-secret-with-more-than-32-characters');
    const raw = Buffer.from(
      JSON.stringify({
        event_type: 'payment.authorized',
        payment: { order_id: 'order_1', id: 'payment_1', amount: 12345, currency: 'INR' },
      }),
    );
    expect(gateway.parseWebhook(raw)).toMatchObject({
      status: 'authorized',
      eventType: 'payment.authorized',
    });
  });
});
