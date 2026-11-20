import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { type AccountOrder } from './account-api';
import { price } from './account-utils';
import { Panel, Badge, ProductThumb } from './AccountUI';

export function OrderCard({ order }: { order: AccountOrder }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-store-line pb-4">
        <div>
          <p className="text-sm font-medium">{order.number}</p>
          <p className="mt-1 text-sm text-store-muted">
            Placed {new Date(order.createdAt).toLocaleDateString('en-IN')} · {order.items.length}{' '}
            {order.items.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        <Badge value={order.status} />
      </div>
      <div className="flex flex-wrap items-center gap-3 py-4">
        {order.items.slice(0, 3).map((item, i) => (
          <div key={`${item.sku}-${i}`} className="flex min-w-[170px] flex-1 items-center gap-3">
            <ProductThumb
              src={item.product?.images[0]?.url}
              alt={item.product?.images[0]?.alt ?? item.productName}
            />
            <div>
              <p className="text-sm">{item.productName}</p>
              <p className="mt-1 text-sm text-store-muted">
                {item.variantName} · Qty {item.quantity}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-store-line pt-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge value={order.paymentStatus} />
          <Badge value={order.shippingStatus} />
        </div>
        <div className="flex items-center gap-4">
          <strong className="text-sm">{price(order.totalPaise)}</strong>
          <Link
            to={`/account/orders/${order.id}`}
            className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
          >
            View order
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </Panel>
  );
}
