import { useState, useRef, useEffect, type FormEvent } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useCart } from '../../stores/cart';
import { useAuth } from '../auth/auth-state';
import { useCartView } from '../cart/use-cart-view';
import {
  loadRazorpayScript,
  openRazorpayCheckout,
  type RazorpayPaymentResponse,
} from '../payments/razorpay-checkout';
import type { AddressDraft } from './address';

export function useCheckout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const cart = useCartView();
  const lines = cart.lines;
  const clear = useCart((state) => state.clear);
  const list = Object.values(lines);
  const subtotal = list.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0);
  const [address, setAddress] = useState<AddressDraft>({
    fullName: auth.data?.name ?? '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    stateCode: '',
    pincode: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<'RAZORPAY'>('RAZORPAY');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const userName = auth.data?.name;
  const idempotencyKey = useRef(crypto.randomUUID());
  const checkoutAddressId = useRef<string | null>(null);
  useEffect(() => {
    if (userName)
      setAddress((current) => ({
        ...current,
        fullName: current.fullName || userName,
      }));
  }, [userName]);
  const checkout = useMutation({
    mutationFn: async (method: 'RAZORPAY') => {
      for (const line of list)
        await api.put('/cart/items', {
          productId: line.product.id,
          variantId: line.variantId,
          quantity: line.quantity,
        });
      if (!checkoutAddressId.current) {
        checkoutAddressId.current = (
          await api.post<{ data: { address: { id: string } } }>('/me/addresses', {
            type: 'SHIPPING',
            recipient: address.fullName,
            phone: address.phone || null,
            line1: address.line1,
            line2: address.line2 || null,
            city: address.city,
            region: address.state,
            postalCode: address.pincode,
            countryCode: 'IN',
            isDefault: true,
          })
        ).data.data.address.id;
      }
      const order = (
        await api.post<{ data: { order: { id: string; orderNumber: string } } }>(
          '/orders',
          { addressId: checkoutAddressId.current, couponCodes: [] },
          { headers: { 'Idempotency-Key': idempotencyKey.current } },
        )
      ).data.data.order;
      const payment = (
        await api.post<{
          data: {
            payment: {
              paymentId: string;
              providerOrderId: string;
              amountPaise: number;
              currency: string;
              publicKey?: string;
            };
          };
        }>(
          `/orders/${order.id}/payment`,
          {},
          { headers: { 'Idempotency-Key': `${idempotencyKey.current}:payment` } },
        )
      ).data.data.payment;
      return {
        method,
        order: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: payment.paymentId,
          razorpayOrderId: payment.providerOrderId,
          amountPaise: payment.amountPaise,
          currency: payment.currency,
          keyId: payment.publicKey ?? '',
        },
      };
    },
  });
  const update = (field: keyof AddressDraft, value: string) =>
    setAddress((current) => ({ ...current, [field]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPaymentMessage('');
    try {
      const result = await checkout.mutateAsync(paymentMethod);
      await launchOnlinePayment(result.order);
    } catch (error) {
      setPaymentMessage(
        axios.isAxiosError<{ error?: { message?: string } }>(error)
          ? (error.response?.data?.error?.message ??
              'We could not start checkout. Please try again.')
          : error instanceof Error
            ? error.message
            : 'We could not start checkout. Please try again.',
      );
    }
  }

  async function launchOnlinePayment(order: {
    orderId: string;
    orderNumber: string;
    paymentId: string;
    razorpayOrderId: string;
    amountPaise: number;
    currency: string;
    keyId: string;
  }) {
    await loadRazorpayScript();
    setCheckoutOpen(true);
    const checkoutInstance = openRazorpayCheckout({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'Maison Beauté',
      description: `Order ${order.orderNumber}`,
      order_id: order.razorpayOrderId,
      prefill: {
        name: auth.data?.name ?? '',
        email: auth.data?.email ?? '',
        contact: address.phone,
      },
      theme: { color: '#121212' },
      handler: (response: RazorpayPaymentResponse) => {
        void confirmOnlinePayment(order, response);
      },
      modal: {
        ondismiss: () => {
          setCheckoutOpen(false);
          setPaymentMessage('Payment window closed. Your cart is saved; you can retry checkout.');
        },
      },
    });
    checkoutInstance.on('payment.failed', () => {
      setCheckoutOpen(false);
      setPaymentMessage('Payment was not completed. Your cart is saved; please try again.');
    });
    checkoutInstance.open();
  }

  async function confirmOnlinePayment(
    order: { orderId: string; orderNumber: string; paymentId: string },
    response: RazorpayPaymentResponse,
  ) {
    setCheckoutOpen(false);
    setVerifying(true);
    setPaymentMessage('Verifying your payment…');
    try {
      await api.post('/payments/verify', {
        providerOrderId: response.razorpay_order_id,
        providerPaymentId: response.razorpay_payment_id,
        signature: response.razorpay_signature,
      });
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const payment = (
          await api.get<{ data: { payment: { status: string } } }>(
            `/orders/${order.orderId}/payment`,
          )
        ).data.data;
        if (payment.payment.status === 'SUCCEEDED') {
          clear();
          idempotencyKey.current = crypto.randomUUID();
          checkoutAddressId.current = null;
          navigate(`/account/orders/${order.orderId}`, {
            replace: true,
            state: { orderNumber: order.orderNumber },
          });
          return;
        }
        if (payment.payment.status === 'FAILED')
          throw new Error('The payment failed. Your cart is saved; please retry.');
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      setPaymentMessage(
        `Payment is still processing. Check order ${order.orderNumber} in My Account before retrying.`,
      );
    } catch (error) {
      setPaymentMessage(
        error instanceof Error
          ? error.message
          : 'We could not verify the payment. Please check My Account before retrying.',
      );
    } finally {
      setVerifying(false);
    }
  }

  return {
    auth,
    cart,
    list,
    subtotal,
    address,
    update,
    paymentMethod,
    setPaymentMethod,
    paymentMessage,
    checkoutOpen,
    verifying,
    checkout,
    submit,
  };
}
