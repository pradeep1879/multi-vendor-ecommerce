import type { AccountOrder } from './account-api';
import { Panel, Badge } from './AccountUI';
import { readable } from './account-utils';
import { Check } from 'lucide-react';

export function OrderProgress({ order }: { order: AccountOrder }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-store text-xl">Order progress</h3>
        <Badge value={order.status} />
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-4">
        {(order.shipment?.events?.length
          ? order.shipment.events
          : [
              {
                status: 'ORDER_PLACED',
                description: 'Order received',
                occurredAt: order.createdAt,
              },
              ...(order.status !== 'PENDING'
                ? [
                    {
                      status: order.status,
                      description: null,
                      occurredAt: order.updatedAt,
                    },
                  ]
                : []),
            ]
        ).map((event, i) => (
          <li key={`${event.status}-${i}`} className="flex gap-3">
            <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#e9eee3] text-[#59634c]">
              <Check size={12} />
            </span>
            <span>
              <strong className="block text-sm">{readable(event.status)}</strong>
              <span className="mt-1 block text-sm text-store-muted">
                {event.description ?? ''}
                {event.occurredAt
                  ? ` · ${new Date(event.occurredAt).toLocaleDateString('en-IN')}`
                  : ''}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
