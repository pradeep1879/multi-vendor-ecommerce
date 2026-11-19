import { AppError } from '../../common/errors/app-error';
import type { Environment } from '../../config/env';
import { PaymentsRepository } from './payments.repository';
import { createPaymentGateway } from './payment-gateway';

export class PaymentsService {
  private readonly repository: PaymentsRepository;
  private readonly gatewayInstance: ReturnType<typeof createPaymentGateway> | undefined;

  constructor(
    private readonly environment: Environment,
    repository = new PaymentsRepository(),
  ) {
    this.repository = repository;
    try {
      this.gatewayInstance = createPaymentGateway(environment);
    } catch {
      this.gatewayInstance = undefined;
    }
  }

  private gateway() {
    if (!this.gatewayInstance)
      throw new AppError(
        503,
        'PAYMENTS_UNAVAILABLE',
        'Online payments are not configured. Set PAYMENT_PROVIDER=razorpay and provide valid Razorpay test credentials in the backend environment.',
      );
    return this.gatewayInstance;
  }

  initiate(customerId: string, orderId: string, idempotencyKey: string) {
    if (!idempotencyKey.trim() || idempotencyKey.length > 160)
      throw new AppError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'A valid Idempotency-Key header is required.',
      );
    return this.repository.initiate(customerId, orderId, this.gateway());
  }

  status(customerId: string, orderId: string) {
    return this.repository.status(customerId, orderId);
  }

  listCustomerRefunds(customerId: string, page: number, pageSize: number) {
    return this.repository.listCustomerRefunds(customerId, page, pageSize);
  }

  createSettlementBatch() {
    const gateway = this.gateway();
    return this.repository.createSettlementBatch(gateway.provider);
  }

  listAdminSettlements(page: number, pageSize: number) {
    return this.repository.listAdminSettlements(page, pageSize);
  }

  reconciliationReport() {
    return this.repository.reconciliationReport();
  }

  startSettlementTransfer(id: string) {
    return this.repository.beginSettlementTransfer(id, this.gateway());
  }

  getSettlement(id: string) {
    return this.repository.findSettlement(id);
  }

  listVendorSettlements(vendorId: string, page: number, pageSize: number) {
    return this.repository.listVendorSettlements(vendorId, page, pageSize);
  }

  async requestRefund(input: {
    orderId: string;
    actorId: string;
    amountPaise: bigint;
    reason: string;
    idempotencyKey: string;
    itemAllocations?: Array<{ orderItemId: string; amountPaise: bigint }>;
  }) {
    if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 160)
      throw new AppError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'A valid Idempotency-Key header is required.',
      );
    const gateway = this.gateway();
    const prepared = await this.repository.prepareRefund(input);
    if (prepared.replayed && ['SUCCEEDED', 'PROCESSING'].includes(prepared.refund.status))
      return { refund: prepared.refund, replayed: true };
    if (!prepared.providerPaymentId)
      throw new AppError(
        409,
        'PROVIDER_PAYMENT_ID_MISSING',
        'Refund cannot be sent without a provider payment ID.',
      );
    const result = await gateway.createRefund({
      providerPaymentId: prepared.providerPaymentId,
      amountPaise: input.amountPaise,
      idempotencyKey: input.idempotencyKey,
    });
    const refund = await this.repository.finishRefund(
      prepared.refund.id,
      result.providerRefundId,
      result.status,
    );
    return { refund, replayed: prepared.replayed };
  }

  async verifyCheckout(
    customerId: string,
    input: { providerOrderId: string; providerPaymentId: string; signature: string },
  ) {
    const gateway = this.gateway();
    const attempt = await this.repository.findCheckout(customerId, input.providerOrderId);
    if (
      !gateway.verifyCheckoutSignature(
        input.providerOrderId,
        input.providerPaymentId,
        input.signature,
      )
    )
      throw new AppError(
        400,
        'INVALID_PAYMENT_SIGNATURE',
        'Payment signature could not be verified.',
      );
    const payment = await gateway.fetchPayment(input.providerPaymentId);
    if (
      payment.providerOrderId !== input.providerOrderId ||
      payment.amountPaise !== attempt.amountPaise ||
      payment.currency !== attempt.payment.currency ||
      payment.status !== 'captured'
    )
      throw new AppError(
        409,
        'PAYMENT_NOT_CAPTURED',
        'Provider has not confirmed a captured payment for this order.',
      );
    return this.repository.capture(input.providerOrderId, payment);
  }

  async webhook(eventId: string, signature: string, rawBody: Uint8Array) {
    const gateway = this.gateway();
    if (!eventId || eventId.length > 200)
      throw new AppError(400, 'WEBHOOK_EVENT_ID_REQUIRED', 'A provider event ID is required.');
    if (!gateway.verifyWebhookSignature(rawBody, signature))
      throw new AppError(
        400,
        'INVALID_WEBHOOK_SIGNATURE',
        'Webhook signature could not be verified.',
      );
    const event = gateway.parseWebhook(rawBody);
    if (event.kind === 'transfer')
      return this.repository.settlementWebhook({
        provider: gateway.provider,
        eventId,
        eventType: event.eventType,
        transferId: event.providerTransferId,
        status: event.status,
        rawBody,
      });
    if (event.kind === 'refund') {
      const record = await this.repository.recordRefundWebhook({
        provider: gateway.provider,
        eventId,
        rawBody,
        event,
      });
      if (event.status === 'succeeded') {
        const refundId =
          record.refundId ??
          (await this.repository.findRefundByProviderId(event.providerRefundId))?.id;
        if (!refundId) return { accepted: true, replayed: record.replayed };
        await this.repository.finishRefund(refundId, event.providerRefundId, 'succeeded');
        await this.repository.finishWebhook(gateway.provider, eventId, true);
      }
      return { accepted: true, replayed: record.replayed };
    }
    const payment =
      event.status === 'captured' ? await gateway.fetchPayment(event.providerPaymentId) : undefined;
    const record = await this.repository.webhook({
      provider: gateway.provider,
      eventId,
      rawBody,
      event,
      ...(payment ? { payment } : {}),
    });
    if (record.status === 'PROCESSING' && record.providerOrderId && payment) {
      try {
        await this.repository.capture(record.providerOrderId, payment);
        await this.repository.finishWebhook(gateway.provider, eventId, true);
        return { accepted: true, replayed: record.replayed };
      } catch (error) {
        await this.repository.finishWebhook(gateway.provider, eventId, false);
        throw error;
      }
    }
    return { accepted: true, replayed: record.replayed };
  }
}
