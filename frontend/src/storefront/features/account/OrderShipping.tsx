import type { AccountOrder } from './account-api';
import { Panel } from './AccountUI';
import { readable } from './account-utils';

export function OrderShipping({ order }: { order: AccountOrder }) {
  return (
    <Panel>
      <h3 className="font-store text-xl">Shipping and payment</h3>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-sm uppercase tracking-wider text-store-muted">Delivering to</p>
          <p className="mt-2 text-sm leading-5">
            {
              (
                order.shippingAddress as {
                  fullName?: string;
                  line1?: string;
                  line2?: string;
                  city?: string;
                  state?: string;
                  pincode?: string;
                }
              ).fullName
            }
            <br />
            {(order.shippingAddress as { line1?: string }).line1}
            <br />
            {(order.shippingAddress as { line2?: string }).line2}
            <br />
            {
              (
                order.shippingAddress as {
                  city?: string;
                  state?: string;
                  pincode?: string;
                }
              ).city
            }
            , {(order.shippingAddress as { state?: string }).state}{' '}
            {(order.shippingAddress as { pincode?: string }).pincode}
          </p>
        </div>
        <div>
          <p className="text-sm uppercase tracking-wider text-store-muted">Shipment</p>
          <p className="mt-2 text-sm">{order.shipment?.courier ?? 'Courier not assigned'}</p>
          <p className="mt-1 text-sm text-store-muted">
            {order.shipment?.trackingNumber
              ? `AWB ${order.shipment.trackingNumber}`
              : 'Tracking details will appear here once available.'}
          </p>
          {order.shipment?.events?.map((event) => (
            <p key={event.status + event.occurredAt} className="mt-2 text-sm text-store-muted">
              {event.description ?? readable(event.status)} ·{' '}
              {new Date(event.occurredAt).toLocaleString('en-IN')}
            </p>
          ))}
        </div>
      </div>
    </Panel>
  );
}
