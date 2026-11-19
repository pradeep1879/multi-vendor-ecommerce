import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { StoreShell } from '../components/storefront/StoreShell';
import { StoreSkeleton } from '../components/storefront/StoreStatus';
import { ProductCard } from '../components/ProductCard';
import { useAuth } from '../features/auth/auth-state';
import { accountApi } from '../features/account/account-api';
import { useWishlist } from '../stores/wishlist';
import type { Product } from '../types/catalog';
import { showToast } from '../../components/feedback/toast';

export function WishlistPage() {
  const auth = useAuth();
  const localProducts = useWishlist((state) => state.productsById);
  const toggleLocal = useWishlist((state) => state.toggle);
  const mergeStarted = useRef(false);
  const query = useQuery({
    queryKey: ['account', 'wishlist'],
    queryFn: accountApi.wishlist,
    enabled: auth.data?.role === 'CUSTOMER',
    retry: false,
  });
  const { isLoading, isSuccess, refetch } = query;
  useEffect(() => {
    const guestFavorites = Object.values(localProducts);
    if (
      auth.data?.role !== 'CUSTOMER' ||
      isLoading ||
      !isSuccess ||
      !guestFavorites.length ||
      mergeStarted.current
    )
      return;
    mergeStarted.current = true;
    void (async () => {
      try {
        for (const product of guestFavorites) await accountApi.addWishlist(product.id);
        guestFavorites.forEach(toggleLocal);
        await refetch();
      } catch {
        showToast(
          'Some saved products could not sync to your account. They remain on this device.',
          'error',
        );
        mergeStarted.current = false;
      }
    })();
  }, [auth.data?.role, isLoading, isSuccess, localProducts, refetch, toggleLocal]);
  const products: Product[] =
    auth.data?.role === 'CUSTOMER'
      ? (query.data ?? []).flatMap((item) => {
          const variant =
            item.variants.find((entry) => entry.availableQuantity > entry.reservedQuantity) ??
            item.variants[0];
          if (!variant) return [];
          return [
            {
              id: item.productId,
              variantId: variant.id,
              variantName: variant.name,
              sku: variant.sku,
              name: item.name,
              slug: item.slug,
              type: '',
              shortDescription: variant.name,
              brand: { name: item.brand },
              pricePaise: variant.pricePaise,
              compareAtPaise: variant.compareAtPaise ?? undefined,
              image: item.image ?? '',
              availableQuantity: Math.max(0, variant.availableQuantity - variant.reservedQuantity),
              rating: item.averageRating ?? 0,
              reviewCount: item.reviewCount,
            },
          ];
        })
      : Object.values(localProducts);
  return (
    <StoreShell>
      <div className="store-container store-collection">
        <div className="store-breadcrumb">
          <Link to="/">Home</Link>
          <span>/</span>
          <strong>Wishlist</strong>
        </div>
        <div className="section-heading">
          <div>
            <h1>Your wishlist</h1>
            <p>
              {products.length} saved {products.length === 1 ? 'product' : 'products'}
            </p>
          </div>
        </div>
        {query.isLoading && <StoreSkeleton variant="products" count={4} />}
        {query.isError && (
          <div className="flex justify-center py-5">
            <button className="button button-outline" onClick={() => void query.refetch()}>
              Retry
            </button>
          </div>
        )}
        {!query.isLoading && !query.isError && products.length > 0 && (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
        {!query.isLoading && !query.isError && !products.length && (
          <div className="catalog-state">
            <h2>Your wishlist is waiting</h2>
            <p>Tap the heart on a product to keep it here.</p>
            <Link to="/products">Explore products</Link>
          </div>
        )}
      </div>
    </StoreShell>
  );
}
