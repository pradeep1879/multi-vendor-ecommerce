import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { accountApi } from './account-api';
import { keys } from './account-utils';
import { State, PageTitle, Empty, Panel, Badge, Pager, ProductThumb } from './AccountUI';

export function ReviewsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...keys.reviews, page],
    queryFn: () => accountApi.reviews(page),
  });
  const eligible = useQuery({
    queryKey: [...keys.reviews, 'eligible'],
    queryFn: accountApi.eligibleReviews,
  });
  const [eligibleId, setEligibleId] = useState('');
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const create = useMutation({
    mutationFn: accountApi.createReview,
    onSuccess: () => {
      setEligibleId('');
      setComment('');
      setTitle('');
      void qc.invalidateQueries({ queryKey: keys.reviews });
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const selected = eligible.data?.find((item) => item.id === eligibleId);
    if (!selected) return;
    create.mutate({
      productId: selected.productId,
      orderId: selected.orderId,
      orderItemId: selected.id,
      rating,
      title: title || undefined,
      comment,
    });
  }
  return (
    <State
      loading={query.isLoading || eligible.isLoading}
      error={query.isError || eligible.isError}
      retry={() => {
        void query.refetch();
        void eligible.refetch();
      }}
    >
      <PageTitle
        eyebrow="Your words matter"
        title="My reviews"
        description="Reviews can be written after an order is marked delivered. New reviews are checked before appearing publicly."
      />
      {Boolean(eligible.data?.length) && (
        <Panel className="mb-5">
          <h3 className="font-store text-xl">Write a review</h3>
          <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Delivered product
              <select
                required
                className="h-10 border border-store-line bg-white px-3 text-sm"
                value={eligibleId}
                onChange={(e) => setEligibleId(e.target.value)}
              >
                <option value="">Choose a product</option>
                {(eligible.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand.name} · {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Rating
              <select
                className="h-10 border border-store-line bg-white px-3 text-sm"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} stars
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              Title (optional)
              <Input maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              Your review
              <textarea
                required
                minLength={10}
                maxLength={2000}
                className="min-h-24 border border-store-line p-3 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <div className="md:col-span-2">
              <Button disabled={create.isPending || !eligibleId}>
                {create.isPending ? 'Submitting…' : 'Submit review'}
              </Button>
            </div>
          </form>
        </Panel>
      )}
      {query.data?.items.length ? (
        <div className="space-y-3">
          {query.data.items.map((review) => (
            <Panel key={review.id} className="flex gap-4">
              <ProductThumb src={review.product.images[0]?.url} alt={review.product.name} />
              <div className="min-w-0 flex-1">
                <p className="text-xs tracking-normal text-store-muted">
                  {review.product.brand.name}
                </p>
                <h3 className="mt-1 font-store text-lg">{review.product.name}</h3>
                <p
                  className="mt-2 text-sm text-[#9b815c]"
                  aria-label={`${review.rating} out of 5 stars`}
                >
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}{' '}
                  <span className="ml-1 text-store-muted">
                    {review.verified ? 'Verified purchase' : ''}
                  </span>
                </p>
                {review.title && <p className="mt-2 text-sm font-medium">{review.title}</p>}
                <p className="mt-1 text-sm leading-5 text-store-muted">{review.comment}</p>
                <div className="mt-3 flex items-center gap-2 text-sm text-store-muted">
                  <Badge value={review.published ? 'PUBLISHED' : 'PENDING'} />
                  {new Date(review.createdAt).toLocaleDateString('en-IN')}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        !eligible.data?.length && (
          <Empty
            title="Nothing to review just yet"
            description="Once a delivered product is eligible, you can share your experience here."
          />
        )
      )}
      <Pager page={page} pages={query.data?.pagination.pages ?? 0} onPage={setPage} />
    </State>
  );
}
