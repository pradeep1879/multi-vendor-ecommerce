import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { accountApi } from './account-api';
import { keys, readable } from './account-utils';
import { State, PageTitle, Empty, Panel } from './AccountUI';
import { OrderCard } from './OrderCard';

export function OrdersPage() {
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    paymentStatus: '',
    from: '',
    to: '',
    sort: 'newest',
    page: 1,
  });
  const query = useQuery({
    queryKey: [...keys.orders, filters],
    queryFn: () => accountApi.orders(filters),
  });
  const patch = (key: keyof typeof filters, value: string) =>
    setFilters({ ...filters, [key]: value, page: 1 });
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      <PageTitle
        eyebrow="Order history"
        title="My orders"
        description="Find and manage every order you’ve placed."
      />
      <Panel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1 text-sm">
            Search orders
            <Input
              placeholder="Order number or product"
              value={filters.q}
              onChange={(e) => patch('q', e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Order status
            <select
              className="h-10 border border-store-line bg-white px-3 text-sm"
              value={filters.status}
              onChange={(e) => patch('status', e.target.value)}
            >
              <option value="">All statuses</option>
              {[
                'PENDING_PAYMENT',
                'CONFIRMED',
                'PROCESSING',
                'PARTIALLY_SHIPPED',
                'SHIPPED',
                'DELIVERED',
                'CANCELLED',
                'PARTIALLY_REFUNDED',
                'REFUNDED',
                'PAYMENT_FAILED',
              ].map((s) => (
                <option key={s} value={s}>
                  {readable(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Payment
            <select
              className="h-10 border border-store-line bg-white px-3 text-sm"
              value={filters.paymentStatus}
              onChange={(e) => patch('paymentStatus', e.target.value)}
            >
              <option value="">All payments</option>
              {['PENDING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'].map((s) => (
                <option key={s} value={s}>
                  {readable(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            From date
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => patch('from', e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            To date
            <Input type="date" value={filters.to} onChange={(e) => patch('to', e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            Sort by
            <select
              className="h-10 border border-store-line bg-white px-3 text-sm"
              value={filters.sort}
              onChange={(e) => patch('sort', e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount-asc">Amount: low to high</option>
              <option value="amount-desc">Amount: high to low</option>
            </select>
          </label>
        </div>
      </Panel>
      <div className="mt-4 space-y-3">
        {query.data?.items.length ? (
          query.data.items.map((order) => <OrderCard key={order.id} order={order} />)
        ) : (
          <Empty
            title="No orders found"
            description={
              filters.q ||
              filters.status ||
              filters.paymentStatus ||
              filters.from ||
              filters.to ||
              filters.sort !== 'newest'
                ? 'Try changing or clearing your filters.'
                : 'Orders you place will appear here.'
            }
          />
        )}
      </div>
      {query.data && query.data.pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span>
            Page {query.data.pagination.page} of {query.data.pagination.pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= query.data.pagination.pages}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </State>
  );
}
