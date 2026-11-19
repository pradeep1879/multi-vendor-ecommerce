import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ProductCard } from '../../components/ProductCard';
import { normalizeProduct } from '../products/catalog';
import { useCategories } from '../../components/storefront/Header/use-header-data';
import { StoreSkeleton } from '../../components/storefront/StoreStatus';

function ProductCollection({ title, category }: { title: string; category?: string }) {
  const params = new URLSearchParams({ page: '1', limit: '8', sort: 'newest' });
  if (category) params.set('category', category);
  const query = useQuery({
    queryKey: ['catalog', params.toString()],
    queryFn: async () =>
      (
        await api.get<{ data: { items: Record<string, unknown>[]; total: number } }>(
          `/products?${params}`,
        )
      ).data.data,
    retry: false,
  });
  if (query.isSuccess && !query.data.items.length) return null;
  return (
    <section className="store-container store-section home-collection">
      <div className="store-section-heading">
        <h2>{title}</h2>
      </div>
      {query.isLoading ? (
        <StoreSkeleton variant="products" />
      ) : query.isError ? (
        <div className="flex justify-center py-5">
          <button className="button button-outline" onClick={() => void query.refetch()}>
            Retry loading
          </button>
        </div>
      ) : (
        <div className="product-grid">
          {query.data?.items.map(normalizeProduct).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
      <div className="home-collection-more">
        <Link
          className="button button-outline"
          to={category ? `/products?category=${encodeURIComponent(category)}` : '/products'}
        >
          View all
        </Link>
      </div>
    </section>
  );
}
export function HomeCollections() {
  const categories = useCategories();
  const featured =
    categories.data
      ?.filter((category) => category.productCount > 0 && !category.parentId)
      .slice(0, 3) ?? [];
  return (
    <div id="shop">
      <ProductCollection title="New arrivals" />
      {featured.map((category) => (
        <ProductCollection key={category.id} title={category.name} category={category.slug} />
      ))}
    </div>
  );
}
