import type { AccountOrder } from './account-api';
import { Panel, ProductThumb } from './AccountUI';
import { price } from './account-utils';

export function OrderItems({ order }: { order: AccountOrder }) {
  return (
    <Panel>
      <h3 className="mb-4 font-store text-xl">Items in this order</h3>
      <div className="divide-y divide-store-line">
        {order.items.map((item) => (
          <div key={item.sku} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <ProductThumb
              src={item.product?.images[0]?.url}
              alt={item.product?.images[0]?.alt ?? item.productName}
              className="h-24 w-20 rounded-sm"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.productName}</p>
              <p className="mt-1 text-sm text-store-muted">
                {item.variantName} · Qty {item.quantity}
              </p>
              <p className="mt-2 text-xs text-store-muted">Item code · {item.sku}</p>
            </div>
            <strong className="self-start pt-1 text-sm">
              {price(item.unitPricePaise * item.quantity)}
            </strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}
