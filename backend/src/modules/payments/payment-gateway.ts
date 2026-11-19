import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Environment } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';

export type GatewayPayment = {
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: bigint;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'failed';
};

export type GatewayPaymentWebhook = {
  kind: 'payment';
  eventType: string;
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: bigint;
  currency: string;
  status: 'authorized' | 'captured' | 'failed' | 'unknown';
};

export type GatewayTransferWebhook = {
  kind: 'transfer';
  eventType: string;
  providerTransferId: string;
  status: 'settled' | 'failed' | 'unknown';
};

export type GatewayRefundWebhook = {
  kind: 'refund';
  eventType: string;
  providerRefundId: string;
  amountPaise: bigint;
  status: 'succeeded' | 'failed' | 'unknown';
};

export type GatewayWebhook = GatewayPaymentWebhook | GatewayTransferWebhook | GatewayRefundWebhook;

export interface PaymentGateway {
  readonly provider: 'TEST' | 'RAZORPAY';
  readonly publicKey?: string;
  createOrder(input: { amountPaise: bigint; currency: string; receipt: string }): Promise<{
    providerOrderId: string;
    publicKey?: string;
  }>;
  verifyCheckoutSignature(
    providerOrderId: string,
    providerPaymentId: string,
    signature: string,
  ): boolean;
  verifyWebhookSignature(rawBody: Uint8Array, signature: string): boolean;
  parseWebhook(rawBody: Uint8Array): GatewayWebhook;
  fetchPayment(providerPaymentId: string): Promise<GatewayPayment>;
  createRefund(input: {
    providerPaymentId: string;
    amountPaise: bigint;
    idempotencyKey: string;
  }): Promise<{
    providerRefundId: string;
    status: 'pending' | 'succeeded';
  }>;
  createTransfer(input: {
    vendorId: string;
    amountPaise: bigint;
    idempotencyKey: string;
  }): Promise<{
    providerTransferId: string;
    status: 'pending';
  }>;
}

function equalHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length)
    return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function digest(secret: string, value: string | Uint8Array): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export class TestPaymentGateway implements PaymentGateway {
  readonly provider = 'TEST' as const;
  private readonly captured = new Map<string, GatewayPayment>();
  private readonly orders = new Map<string, { amountPaise: bigint; currency: string }>();

  constructor(private readonly secret: string) {}

  async createOrder(input: { amountPaise: bigint; currency: string; receipt: string }) {
    const providerOrderId = `test_order_${randomUUID()}`;
    this.orders.set(providerOrderId, { amountPaise: input.amountPaise, currency: input.currency });
    return { providerOrderId };
  }

  verifyCheckoutSignature(providerOrderId: string, providerPaymentId: string, signature: string) {
    const valid = equalHex(
      digest(this.secret, `${providerOrderId}|${providerPaymentId}`),
      signature,
    );
    if (valid) {
      const order = this.orders.get(providerOrderId);
      if (!order) return false;
      this.captured.set(providerPaymentId, {
        providerOrderId,
        providerPaymentId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        status: 'captured',
      });
    }
    return valid;
  }

  verifyWebhookSignature(rawBody: Uint8Array, signature: string) {
    return equalHex(digest(this.secret, rawBody), signature);
  }

  parseWebhook(rawBody: Uint8Array): GatewayWebhook {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(new TextDecoder().decode(rawBody)) as Record<string, unknown>;
    } catch {
      throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook body is invalid.');
    }
    if (typeof body.event_type === 'string' && body.event_type.startsWith('transfer.')) {
      const transfer = body.transfer as Record<string, unknown> | undefined;
      if (typeof transfer?.id !== 'string')
        throw new AppError(400, 'INVALID_WEBHOOK', 'Transfer webhook payload is incomplete.');
      return {
        kind: 'transfer',
        eventType: body.event_type,
        providerTransferId: transfer.id,
        status:
          body.event_type === 'transfer.settled'
            ? 'settled'
            : body.event_type === 'transfer.failed'
              ? 'failed'
              : 'unknown',
      };
    }
    if (typeof body.event_type === 'string' && body.event_type.startsWith('refund.')) {
      const refund = body.refund as Record<string, unknown> | undefined;
      if (typeof refund?.id !== 'string' || typeof refund.amount !== 'number')
        throw new AppError(400, 'INVALID_WEBHOOK', 'Refund webhook payload is incomplete.');
      return {
        kind: 'refund',
        eventType: body.event_type,
        providerRefundId: refund.id,
        amountPaise: BigInt(refund.amount),
        status:
          body.event_type === 'refund.processed'
            ? 'succeeded'
            : body.event_type === 'refund.failed'
              ? 'failed'
              : 'unknown',
      };
    }
    const payment = body.payment as Record<string, unknown> | undefined;
    const type = body.event_type;
    if (
      typeof type !== 'string' ||
      !payment ||
      typeof payment.order_id !== 'string' ||
      typeof payment.id !== 'string' ||
      typeof payment.amount !== 'number'
    )
      throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook payload is incomplete.');
    const event: GatewayWebhook = {
      kind: 'payment',
      eventType: type,
      providerOrderId: payment.order_id,
      providerPaymentId: payment.id,
      amountPaise: BigInt(payment.amount),
      currency: typeof payment.currency === 'string' ? payment.currency : 'INR',
      status:
        type === 'payment.authorized'
          ? 'authorized'
          : type === 'payment.captured'
            ? 'captured'
            : type === 'payment.failed'
              ? 'failed'
              : 'unknown',
    };
    if (event.status === 'captured')
      this.captured.set(event.providerPaymentId, {
        providerOrderId: event.providerOrderId,
        providerPaymentId: event.providerPaymentId,
        amountPaise: event.amountPaise,
        currency: event.currency,
        status: 'captured',
      });
    return event;
  }

  async fetchPayment(providerPaymentId: string) {
    const payment = this.captured.get(providerPaymentId);
    if (!payment)
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment was not found by the test provider.');
    return payment;
  }

  async createRefund(input: {
    providerPaymentId: string;
    amountPaise: bigint;
    idempotencyKey: string;
  }) {
    void input;
    return { providerRefundId: `test_refund_${randomUUID()}`, status: 'succeeded' as const };
  }

  async createTransfer(input: {
    vendorId: string;
    amountPaise: bigint;
    idempotencyKey: string;
  }): Promise<{
    providerTransferId: string;
    status: 'pending';
  }> {
    void input;
    return { providerTransferId: `test_transfer_${randomUUID()}`, status: 'pending' as const };
  }
}

export class RazorpayGateway implements PaymentGateway {
  readonly provider = 'RAZORPAY' as const;
  readonly publicKey: string;
  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {
    this.publicKey = keyId;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        'content-type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => undefined);
      const providerError =
        typeof payload === 'object' && payload !== null && 'error' in payload
          ? (payload as { error?: { code?: unknown; description?: unknown; field?: unknown } }).error
          : undefined;
      const description =
        typeof providerError?.description === 'string'
          ? providerError.description.slice(0, 300)
          : 'Payment provider request failed.';
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'payment_provider_request_failed',
          provider: 'RAZORPAY',
          status: response.status,
          code: typeof providerError?.code === 'string' ? providerError.code : undefined,
          field: typeof providerError?.field === 'string' ? providerError.field : undefined,
          description,
        }),
      );
      throw new AppError(
        502,
        'PAYMENT_PROVIDER_ERROR',
        `Razorpay rejected the payment request: ${description}`,
      );
    }
    return (await response.json()) as T;
  }

  async createOrder(input: { amountPaise: bigint; currency: string; receipt: string }) {
    const result = await this.request<{ id: string }>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(input.amountPaise),
        currency: input.currency,
        receipt: input.receipt,
      }),
    });
    return { providerOrderId: result.id, publicKey: this.keyId };
  }

  verifyCheckoutSignature(providerOrderId: string, providerPaymentId: string, signature: string) {
    return equalHex(digest(this.keySecret, `${providerOrderId}|${providerPaymentId}`), signature);
  }

  verifyWebhookSignature(rawBody: Uint8Array, signature: string) {
    return equalHex(digest(this.webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: Uint8Array): GatewayWebhook {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(new TextDecoder().decode(rawBody)) as Record<string, unknown>;
    } catch {
      throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook body is invalid.');
    }
    const eventType = body.event;
    const payload = body.payload as Record<string, unknown> | undefined;
    if (typeof eventType === 'string' && eventType.startsWith('transfer.')) {
      const wrapper = payload?.transfer as Record<string, unknown> | undefined;
      const transfer = wrapper?.entity as Record<string, unknown> | undefined;
      if (typeof transfer?.id !== 'string')
        throw new AppError(400, 'INVALID_WEBHOOK', 'Transfer webhook payload is incomplete.');
      return {
        kind: 'transfer',
        eventType,
        providerTransferId: transfer.id,
        status:
          eventType === 'transfer.settled' || transfer.status === 'processed'
            ? 'settled'
            : eventType === 'transfer.failed'
              ? 'failed'
              : 'unknown',
      };
    }
    if (typeof eventType === 'string' && eventType.startsWith('refund.')) {
      const wrapper = payload?.refund as Record<string, unknown> | undefined;
      const refund = wrapper?.entity as Record<string, unknown> | undefined;
      if (typeof refund?.id !== 'string' || typeof refund.amount !== 'number')
        throw new AppError(400, 'INVALID_WEBHOOK', 'Refund webhook payload is incomplete.');
      return {
        kind: 'refund',
        eventType,
        providerRefundId: refund.id,
        amountPaise: BigInt(refund.amount),
        status:
          eventType === 'refund.processed' || refund.status === 'processed'
            ? 'succeeded'
            : eventType === 'refund.failed'
              ? 'failed'
              : 'unknown',
      };
    }
    const wrapper = payload?.payment as Record<string, unknown> | undefined;
    const payment = wrapper?.entity as Record<string, unknown> | undefined;
    if (
      typeof eventType !== 'string' ||
      typeof payment?.order_id !== 'string' ||
      typeof payment.id !== 'string' ||
      typeof payment.amount !== 'number'
    )
      throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook payload is incomplete.');
    return {
      kind: 'payment',
      eventType,
      providerOrderId: payment.order_id,
      providerPaymentId: payment.id,
      amountPaise: BigInt(payment.amount),
      currency: typeof payment.currency === 'string' ? payment.currency : 'INR',
      status:
        eventType === 'payment.captured'
          ? 'captured'
          : eventType === 'payment.failed'
            ? 'failed'
            : 'unknown',
    };
  }

  async fetchPayment(providerPaymentId: string) {
    const payment = await this.request<{
      id: string;
      order_id: string;
      amount: number;
      currency: string;
      status: string;
    }>(`/payments/${encodeURIComponent(providerPaymentId)}`);
    return {
      providerOrderId: payment.order_id,
      providerPaymentId: payment.id,
      amountPaise: BigInt(payment.amount),
      currency: payment.currency,
      status:
        payment.status === 'captured'
          ? ('captured' as const)
          : payment.status === 'authorized'
            ? ('authorized' as const)
            : payment.status === 'failed'
              ? ('failed' as const)
              : ('created' as const),
    };
  }

  async createRefund(input: {
    providerPaymentId: string;
    amountPaise: bigint;
    idempotencyKey: string;
  }) {
    const refund = await this.request<{ id: string; status: string }>(
      `/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      {
        method: 'POST',
        headers: { 'X-Refund-Idempotency': input.idempotencyKey },
        body: JSON.stringify({ amount: Number(input.amountPaise) }),
      },
    );
    return {
      providerRefundId: refund.id,
      status: refund.status === 'processed' ? ('succeeded' as const) : ('pending' as const),
    };
  }

  async createTransfer(input: {
    vendorId: string;
    amountPaise: bigint;
    idempotencyKey: string;
  }): Promise<{
    providerTransferId: string;
    status: 'pending';
  }> {
    void input;
    throw new AppError(
      503,
      'ROUTE_LINKED_ACCOUNT_REQUIRED',
      'Razorpay Route linked-account mapping is not configured.',
    );
  }
}

export function createPaymentGateway(environment: Environment): PaymentGateway {
  if (environment.paymentProvider === 'test' && environment.paymentTestSecret)
    return new TestPaymentGateway(environment.paymentTestSecret);
  if (
    environment.paymentProvider === 'razorpay' &&
    environment.paymentKeyId &&
    environment.paymentKeySecret &&
    environment.paymentWebhookSecret
  )
    return new RazorpayGateway(
      environment.paymentKeyId,
      environment.paymentKeySecret,
      environment.paymentWebhookSecret,
    );
  throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'A payment provider is not configured.');
}
