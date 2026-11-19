import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { ProductCard } from '../../../components/ProductCard';
import type { CatalogProduct } from '../../../types/catalog';
import { normalizeProduct } from '../catalog';
import { StoreSkeleton } from '../../../components/storefront/StoreStatus';

export function RelatedProducts({ product }: { product: CatalogProduct }) {
  const category = product.categories?.[0]?.category.slug;
  const query = useQuery({
    queryKey: ['related-products', product.id, category],
    queryFn: async () =>
      (
        await api.get<{ data: { items: Array<Record<string, unknown>> } }>(
          `/products?limit=5&category=${encodeURIComponent(category ?? '')}`,
        )
      ).data.data.items
        .map(normalizeProduct)
        .filter((item) => item.id !== product.id)
        .slice(0, 4),
    enabled: Boolean(category),
    retry: false,
  });
  if (query.isLoading)
    return (
      <section className="store-related">
        <h2>You may also like</h2>
        <StoreSkeleton variant="products" count={4} />
      </section>
    );
  if (!query.data?.length) return null;
  return (
    <section className="store-related">
      <h2>You may also like</h2>
      <div className="product-grid">
        {query.data.map((item) => (
          <ProductCard key={item.id} product={item} />
        ))}
      </div>
    </section>
  );
}
