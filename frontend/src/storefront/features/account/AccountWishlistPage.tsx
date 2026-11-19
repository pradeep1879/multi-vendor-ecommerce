import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { accountApi } from './account-api';
import { keys, price } from './account-utils';
import { State, PageTitle, Empty, Panel } from './AccountUI';

export function WishlistPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.wishlist,
    queryFn: accountApi.wishlist,
  });
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [added, setAdded] = useState('');
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.wishlist });
    void qc.invalidateQueries({ queryKey: keys.overview });
  };
  const remove = useMutation({
    mutationFn: accountApi.removeWishlist,
    onSuccess: invalidate,
  });
  const add = useMutation({
    mutationFn: ({ productId, variantId }: { productId: string; variantId: string }) =>
      accountApi.wishlistToCart(productId, variantId),
    onSuccess: (_, item) => {
      const saved = query.data?.find((product) => product.productId === item.productId);
      setAdded(`${saved?.name ?? 'Product'} was added to your bag.`);
      void qc.invalidateQueries({ queryKey: ['cart'] });
    },
  });
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      <PageTitle
        eyebrow="Saved products"
        title="Wishlist"
        description="Your favourites, kept close for whenever you’re ready."
      />
      {query.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.map((item) => {
            const variant =
              item.variants.find(
                (candidate) => candidate.id === selectedVariants[item.productId],
              ) ?? item.variants[0];
            const stock = variant ? variant.availableQuantity - variant.reservedQuantity : 0;
            return (
              <Panel key={item.id} className="p-0">
                <div
                  className="relative aspect-4/3
                 bg-store-soft"
                >
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-[#898a7d">
                      <Heart />
                    </div>
                  )}
                  <button
                    aria-label={`Remove ${item.name} from wishlist`}
                    onClick={() => remove.mutate(item.productId)}
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center bg-white/90"
                  >
                    <Heart size={15} fill="#6e7561" />
                  </button>
                </div>
                <div className="p-4">
                  <p className="text-[9px]  tracking-[.16em] text-store-muted">
                    {item.brand}
                  </p>
                  <h3 className="mt-1 font-store text-xl">{item.name}</h3>
                  {item.averageRating !== null && (
                    <p
                      className="mt-1 text-sm text-[#9b815c]"
                      aria-label={`Rated ${item.averageRating.toFixed(1)} out of 5`}
                    >
                      ★ {item.averageRating.toFixed(1)}{' '}
                      <span className="text-store-muted">({item.reviewCount})</span>
                    </p>
                  )}
                  {variant ? (
                    <>
                      <label className="mt-3 grid gap-1 text-sm text-store-muted">
                        Variant
                        <select
                          className="h-9 border border-store-line bg-white px-2 text-sm"
                          value={variant.id}
                          onChange={(e) =>
                            setSelectedVariants({
                              ...selectedVariants,
                              [item.productId]: e.target.value,
                            })
                          }
                        >
                          {item.variants.map((choice) => (
                            <option key={choice.id} value={choice.id}>
                              {choice.name} · {price(choice.pricePaise)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="mt-3 text-sm">
                        {price(variant.pricePaise)}
                        {variant.compareAtPaise && (
                          <s className="ml-2 text-sm text-store-muted">
                            {price(variant.compareAtPaise)}
                          </s>
                        )}
                      </p>
                      <div className="mt-2 text-sm">
                        {item.status !== 'ACTIVE'
                          ? 'Unavailable'
                          : stock <= 0
                            ? 'Out of stock'
                            : stock <= 5
                              ? `Low stock · ${stock} left`
                              : 'In stock'}
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[#8a5147]">Currently unavailable</p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      disabled={!variant || item.status !== 'ACTIVE' || stock <= 0 || add.isPending}
                      onClick={() =>
                        variant &&
                        add.mutate({
                          productId: item.productId,
                          variantId: variant.id,
                        })
                      }
                    >
                      {add.isPending && add.variables?.productId === item.productId
                        ? 'Adding…'
                        : 'Add to bag'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(item.productId)}
                    >
                      {remove.isPending && remove.variables === item.productId
                        ? 'Removing…'
                        : 'Remove'}
                    </Button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Save the things you love"
          description="Your favourite products will be waiting here when you come back."
        />
      )}
      {added && (
        <p role="status" className="mt-3 text-sm text-[#59634c]">
          {added}
        </p>
      )}
    </State>
  );
}
