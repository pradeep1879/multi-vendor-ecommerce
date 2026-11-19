import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accountApi } from './account-api';
import { keys, price, readable } from './account-utils';
import { State, PageTitle, Empty, Panel, Badge, Pager } from './AccountUI';

export function RefundsPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...keys.refunds, page],
    queryFn: () => accountApi.refunds(page),
  });
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      <PageTitle
        eyebrow="Money back to you"
        title="Refunds"
        description="Refunds are shown here once a return has been received and reviewed."
      />
      {query.data?.items.length ? (
        <div className="space-y-3">
          {query.data.items.map((item) => (
            <Panel key={item.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {item.number} · {item.order.number}
                </p>
                <p className="mt-1 text-sm text-store-muted">
                  {readable(item.method)} · {new Date(item.createdAt).toLocaleDateString('en-IN')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <strong className="text-sm">{price(item.amountPaise)}</strong>
                <Badge value={item.status} />
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Empty
          title="No refunds to show"
          description="If a return is approved and a refund is recorded, its progress will appear here."
          to="/account/returns"
          action="View returns"
        />
      )}
      <Pager page={page} pages={query.data?.pagination.pages ?? 0} onPage={setPage} />
    </State>
  );
}
