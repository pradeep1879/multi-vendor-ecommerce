import { OrderPayment } from './OrderPayment';
import { OrderShipping } from './OrderShipping';
import { OrderItems } from './OrderItems';
import { OrderProgress } from './OrderProgress';
import { useState, type FormEvent } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { accountApi } from './account-api';
import { keys } from './account-utils';
import { State, PageTitle, Panel } from './AccountUI';

export function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const qc = useQueryClient();
  const location = useLocation();
  const query = useQuery({
    queryKey: [...keys.orders, orderId],
    queryFn: () => accountApi.order(orderId),
    enabled: Boolean(orderId),
  });
  const [returnItem, setReturnItem] = useState('');
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [reason, setReason] = useState('DAMAGED');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const cancel = useMutation({
    mutationFn: () => accountApi.cancelOrder(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.orders });
      void query.refetch();
    },
  });
  const createReturn = useMutation({
    mutationFn: accountApi.requestReturn,
    onSuccess: () => {
      setMessage('Your return request was submitted.');
      setReturnItem('');
      setReturnQuantity(1);
      qc.invalidateQueries({ queryKey: keys.returns });
      void query.refetch();
    },
  });
  const selectedReturnItem = query.data?.items.find((item) => item.id === returnItem);
  function submitReturn(e: FormEvent) {
    e.preventDefault();
    if (!returnItem) return;
    createReturn.mutate({
      orderId,
      orderItemId: returnItem,
      quantity: returnQuantity,
      reason,
      description: description || undefined,
    });
  }
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      {query.data && (
        <>
          {(location.state as { orderNumber?: string } | null)?.orderNumber ===
            query.data.number && (
            <div className="store-order-confirmation" role="status">
              <h2>Thank you for your order</h2>
              <p>
                Order {query.data.number} has been received. Payment status:{' '}
                {query.data.paymentStatus.toLowerCase()}.
              </p>
              <Link to="/products">Continue shopping</Link>
            </div>
          )}
          <PageTitle
            eyebrow="Order details"
            title={query.data.number}
            description={`Placed ${new Date(query.data.createdAt).toLocaleString('en-IN')}`}
            action={
              <Link to="/account/orders" className="text-sm underline underline-offset-4">
                All orders
              </Link>
            }
          />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,.8fr)]">
            <div className="space-y-5">
              <OrderProgress order={query.data} />
              <OrderItems order={query.data} />
              <OrderShipping order={query.data} />
            </div>
            <div className="space-y-5">
              <OrderPayment order={query.data} />
              {['PENDING', 'CONFIRMED'].includes(query.data.status) &&
                query.data.paymentStatus === 'PENDING' && (
                  <Panel>
                    <h3 className="font-store text-xl">Need to cancel?</h3>
                    <p className="mt-2 text-sm leading-5 text-store-muted">
                      This order has not entered fulfillment, so it can still be cancelled.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      disabled={cancel.isPending}
                      onClick={() => {
                        if (window.confirm('Cancel this order?')) cancel.mutate();
                      }}
                    >
                      {cancel.isPending ? 'Cancelling…' : 'Cancel order'}
                    </Button>
                  </Panel>
                )}
              {query.data.status === 'DELIVERED' && (
                <Panel>
                  <h3 className="font-store text-xl">Something not quite right?</h3>
                  <p className="mt-2 text-sm leading-5 text-store-muted">
                    Request a return within 7 days of delivery.
                  </p>
                  <form className="mt-4 space-y-3" onSubmit={submitReturn}>
                    <label className="grid gap-1 text-sm">
                      Product
                      <select
                        required
                        className="h-10 border border-store-line bg-white px-3 text-sm"
                        value={returnItem}
                        onChange={(e) => setReturnItem(e.target.value)}
                      >
                        <option value="">Select an item</option>
                        {query.data.items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.productName} · Qty {item.quantity}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Quantity
                      <select
                        className="h-10 border border-store-line bg-white px-3 text-sm"
                        value={returnQuantity}
                        onChange={(e) => setReturnQuantity(Number(e.target.value))}
                      >
                        {Array.from(
                          { length: selectedReturnItem?.quantity ?? 1 },
                          (_, i) => i + 1,
                        ).map((quantity) => (
                          <option key={quantity} value={quantity}>
                            {quantity}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Reason
                      <select
                        className="h-10 border border-store-line bg-white px-3 text-sm"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      >
                        <option value="DAMAGED">Damaged</option>
                        <option value="WRONG_ITEM">Wrong item</option>
                        <option value="NOT_AS_EXPECTED">Not as expected</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Details (optional)
                      <textarea
                        className="min-h-20 border border-store-line p-3 text-sm"
                        maxLength={1000}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </label>
                    <Button disabled={!returnItem || createReturn.isPending}>
                      {createReturn.isPending ? 'Submitting…' : 'Request return'}
                    </Button>
                  </form>
                  {message && (
                    <p role="status" className="mt-2 text-sm text-[#59634c]">
                      {message}
                    </p>
                  )}
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </State>
  );
}
