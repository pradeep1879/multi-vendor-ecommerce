import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { accountApi } from './account-api';
import { keys, readable } from './account-utils';
import { State, PageTitle, Panel, Badge, Pager, Empty } from './AccountUI';

export function ReturnsPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...keys.returns, page],
    queryFn: () => accountApi.returns(page),
  });
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      <PageTitle
        eyebrow="After your order"
        title="Returns"
        description="Review the return requests you’ve made for your orders."
      />
      {query.data?.items.length ? (
        <div className="space-y-3">
          {query.data.items.map((item) => (
            <Panel key={item.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">
                  Return {item.number} · Order {item.order.number}
                </strong>
                <Badge value={item.status} />
              </div>
              <p className="text-sm">
                {item.orderItem.productName}
                {item.orderItem.variantName ? ` · ${item.orderItem.variantName}` : ''} · Qty{' '}
                {item.quantity}
              </p>
              <p className="text-sm text-store-muted">
                {readable(item.reason)} · Requested{' '}
                {new Date(item.requestedAt).toLocaleDateString('en-IN')}
              </p>
            </Panel>
          ))}
        </div>
      ) : (
        <Empty
          title="No return requests"
          description="If an order is eligible for a return, you can start a request from its details."
          to="/account/orders"
          action="View orders"
        />
      )}
      <Pager page={page} pages={query.data?.pagination.pages ?? 0} onPage={setPage} />
      <p className="mt-8 text-sm text-store-muted">
        Looking for a refund?{' '}
        <Link className="underline underline-offset-4" to="/account/refunds">
          View refunds
        </Link>
        .
      </p>
    </State>
  );
}
