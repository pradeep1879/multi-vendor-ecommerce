import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Heart, MapPin, Package, RotateCcw, Star, Truck } from 'lucide-react';
import { accountApi } from './account-api';
import { keys, price, readable } from './account-utils';
import { State, PageTitle, Empty, Panel, Badge, ProductThumb } from './AccountUI';

export function AccountOverviewPage() {
  const query = useQuery({
    queryKey: keys.overview,
    queryFn: accountApi.overview,
  });
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      {query.data && (
        <>
          <PageTitle
            eyebrow="A considered little corner"
            title={
              <>
                Hello, <em className="text-store-muted">{query.data.name.split(' ')[0]}</em>
              </>
            }
            description="Your orders, saved favourites and everyday account details, all in one place."
            action={
              <Link
                to="/"
                className="inline-flex h-10 items-center gap-2 bg-[#99ee0f] px-4 text-sm text-white hover:bg-[#a1f10c]"
              >
                Continue shopping
                {/* <ArrowRight size={14} /> */}
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {[
              {
                label: 'Orders',
                value: query.data.metrics.orders,
                icon: Package,
                to: '/account/orders',
              },
              {
                label: 'Wishlist',
                value: query.data.metrics.wishlist,
                icon: Heart,
                to: '/account/wishlist',
              },
              {
                label: 'Open orders',
                value: query.data.metrics.pendingDeliveries,
                icon: Truck,
                to: '/account/orders',
              },
              {
                label: 'Reviews',
                value: query.data.metrics.reviews,
                icon: Star,
                to: '/account/reviews',
              },
              {
                label: 'Open returns',
                value: query.data.metrics.pendingReturns,
                icon: RotateCcw,
                to: '/account/returns',
              },
            ].map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="border border-store-line bg-white p-4 transition hover:border-store-line sm:p-5"
              >
                <div className="flex items-center justify-between text-store-muted">
                  <span className="text-sm">{item.label}</span>
                  <item.icon size={15} />
                </div>
                <strong className="mt-4 block font-store text-3xl font-normal">{item.value}</strong>
              </Link>
            ))}
          </div>
          {query.data.activeOrder && (
            <Panel className="mt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[.16em] text-store-muted">
                    Your latest active order
                  </p>
                  <h3 className="mt-1 font-store text-2xl">{query.data.activeOrder.number}</h3>
                </div>
                <Badge
                  value={query.data.activeOrder.shipment?.status ?? query.data.activeOrder.status}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2 text-sm text-store-muted">
                {query.data.activeOrder.shipment?.courier && (
                  <span>Courier · {query.data.activeOrder.shipment.courier}</span>
                )}
                {query.data.activeOrder.shipment?.trackingNumber && (
                  <span>AWB · {query.data.activeOrder.shipment.trackingNumber}</span>
                )}
                {query.data.activeOrder.shipment?.events?.slice(0, 3).map((event) => (
                  <span key={event.status + event.occurredAt}>
                    {event.description ?? readable(event.status)} ·{' '}
                    {new Date(event.occurredAt).toLocaleDateString('en-IN')}
                  </span>
                ))}
                <Link
                  to={`/account/orders/${query.data.activeOrder.id}`}
                  className="inline-flex items-center gap-1 text-store-ink underline underline-offset-4"
                >
                  Track order
                  <ArrowRight size={12} />
                </Link>
              </div>
            </Panel>
          )}
          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,.8fr)]">
            <Panel>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[.16em] text-store-muted">
                    Your latest activity
                  </p>
                  <h3 className="mt-1 font-store text-2xl font-normal">Recent orders</h3>
                </div>
                <Link to="/account/orders" className="text-sm underline underline-offset-4">
                  View all
                </Link>
              </div>
              {query.data.recentOrders.length ? (
                <div className="divide-y divide-store-line">
                  {query.data.recentOrders.map((order) => (
                    <Link
                      key={order.id}
                      to={`/account/orders/${order.id}`}
                      className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex -space-x-2">
                        {order.items.slice(0, 2).map((item, i) => (
                          <ProductThumb
                            key={`${item.productName}-${i}`}
                            src={item.variant?.product?.images?.[0]?.url}
                            alt={item.productName}
                          />
                        ))}
                      </div>
                      <div className="min-w-[130px] flex-1">
                        <strong className="block text-sm">{order.number}</strong>
                        <span className="mt-1 block text-sm text-store-muted">
                          {new Date(order.createdAt).toLocaleDateString('en-IN')} ·{' '}
                          {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <Badge value={order.status} />
                      <strong className="w-full text-right text-sm sm:w-auto">
                        {price(order.totalPaise)}
                      </strong>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Your order history starts here"
                  description="Orders you place will appear here."
                />
              )}
            </Panel>
            <div className="space-y-5">
              <Panel>
                <p className="text-sm uppercase tracking-[.16em] text-store-muted">
                  Saved for later
                </p>
                <h3 className="mt-1 font-store text-2xl font-normal">Your wishlist</h3>
                <p className="mt-2 text-sm text-store-muted">
                  {query.data.metrics.wishlist
                    ? `${query.data.metrics.wishlist} favourite${query.data.metrics.wishlist === 1 ? '' : 's'} ready when you are.`
                    : 'Save products here to find them again quickly.'}
                </p>
                <Link
                  to="/account/wishlist"
                  className="mt-5 inline-flex items-center gap-2 text-sm underline underline-offset-4"
                >
                  Open wishlist
                  <ArrowRight size={13} />
                </Link>
              </Panel>
              <Panel>
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-[#777d68]" />
                  <p className="text-sm uppercase tracking-[.16em] text-store-muted">
                    Delivery details
                  </p>
                </div>
                {query.data.addresses.length ? (
                  query.data.addresses.slice(0, 1).map((address) => (
                    <div key={address.id}>
                      <h3 className="mt-3 font-store text-xl">
                        {address.label}{' '}
                        {address.isDefault && (
                          <span className="font-sans text-sm text-store-muted">· Default</span>
                        )}
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-store-muted">
                        {address.fullName}
                        <br />
                        {address.city}, {address.state} {address.pincode}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="mt-3 text-sm text-store-muted">
                    Add an address for a smoother checkout.
                  </p>
                )}
                <Link
                  to="/account/addresses"
                  className="mt-4 inline-flex text-sm underline underline-offset-4"
                >
                  Manage addresses
                </Link>
              </Panel>
            </div>
          </div>
          <Panel className="mt-5">
            <p className="text-sm uppercase tracking-[.16em] text-store-muted">Account shortcuts</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Profile', '/account/profile'],
                ['Addresses', '/account/addresses'],
                ['Returns & refunds', '/account/returns'],
                ['Security', '/account/security'],
              ].map(([label, to]) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center justify-between border border-store-line px-3 py-3 text-sm hover:bg-store-soft"
                >
                  {label}
                  <ArrowRight size={13} />
                </Link>
              ))}
            </div>
          </Panel>
        </>
      )}
    </State>
  );
}
