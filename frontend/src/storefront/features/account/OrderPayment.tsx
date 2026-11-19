import type { AccountOrder } from './account-api';
import { Panel } from './AccountUI';
import { price, readable } from './account-utils';
import { ArrowDownToLine } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { api } from '../../api/client';

export function OrderPayment({ order }: { order: AccountOrder }) {
  return (
    <Panel>
      <h3 className="font-store text-xl">Payment summary</h3>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-store-muted">Subtotal</dt>
          <dd>{price(order.subtotalPaise)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-store-muted">Discount</dt>
          <dd>−{price(order.discountPaise)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-store-muted">GST</dt>
          <dd>{price(order.taxPaise)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-store-muted">Shipping</dt>
          <dd>{order.shippingPaise ? price(order.shippingPaise) : 'Complimentary'}</dd>
        </div>
        <div className="flex justify-between border-t border-store-line pt-3 text-sm font-medium">
          <dt>Total</dt>
          <dd>{price(order.totalPaise)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-store-muted">
        {readable(order.paymentMethod)} · {readable(order.paymentStatus)}
      </p>
      {order.invoice && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={async () => {
            const response = await api.get(`/account/orders/${order.id}/invoice`);
            const blob = new Blob([JSON.stringify(response.data.data, null, 2)], {
              type: 'application/json',
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${order.invoice?.number}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          <ArrowDownToLine size={14} />
          Download invoice data
        </Button>
      )}
    </Panel>
  );
}
