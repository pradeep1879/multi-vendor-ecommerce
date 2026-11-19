import type { AccountOrder } from './account-api';
import { Panel, ProductThumb } from './AccountUI';
import { price } from './account-utils';

export function OrderItems({ order }: { order: AccountOrder }) {
  return (
    <Panel>
      <h3 className="mb-4 font-store text-xl">Items in this order</h3>
      <div className="divide-y divide-store-line">
        {order.items.map((item) => (
          <div key={item.sku} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
            <ProductThumb src={item.variant?.product?.images?.[0]?.url} alt={item.productName} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{item.productName}</p>
              <p className="mt-1 text-sm text-store-muted">
                {item.variantName} · {item.sku} · Qty {item.quantity}
              </p>
            </div>
            <strong className="text-sm">{price(item.unitPricePaise * item.quantity)}</strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}
