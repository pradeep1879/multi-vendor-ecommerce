import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ProductCard } from '../../components/ProductCard';
import { StoreSkeleton, StoreStatus } from '../../components/storefront/StoreStatus';
import { normalizeProduct } from './catalog';
import { CollectionFilters } from './CollectionFilters';

type ProductResponse = { items: Array<Record<string, unknown>>; total: number; totalPages: number };

export function ProductGrid({
  limit,
  listing = false,
}: {
  filter?: string;
  limit?: number;
  listing?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const apiQuery = new URLSearchParams({
    page: String(listing ? page : 1),
    limit: String(limit ?? (listing ? 24 : 8)),
    sort,
  });
  for (const name of ['q', 'category', 'brand', 'inStock'])
    if (params.get(name)) apiQuery.set(name, params.get(name)!);
  for (const name of ['minPrice', 'maxPrice']) {
    const value = params.get(name);
    if (value && Number.isFinite(Number(value)))
      apiQuery.set(name, String(Math.round(Number(value) * 100)));
  }
  const query = useQuery({
    queryKey: ['catalog', apiQuery.toString()],
    queryFn: async () =>
      (await api.get<{ data: ProductResponse }>(`/products?${apiQuery}`)).data.data,
    retry: false,
  });
  const categories = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: async () =>
      (await api.get<{ data: Array<{ id: string; name: string; slug: string }> }>('/categories'))
        .data.data,
    retry: false,
  });
  const title = q
    ? `Search results for “${q}”`
    : (categories.data?.find((item) => item.slug === category)?.name ??
      (category ? category.replaceAll('-', ' ') : 'All products'));
  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== 'page') next.delete('page');
    setParams(next);
  };
  const clear = () => setParams(q ? { q } : {});
  const products = (query.data?.items ?? []).map(normalizeProduct);
  return (
    <section className="store-container store-collection" id="shop">
      {listing && (
        <>
          <nav className="store-breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <span>{q ? 'Search' : title}</span>
          </nav>
          <h1>{title}</h1>
          <div className="store-collection-toolbar">
            <CollectionFilters
              params={params}
              categories={categories.data ?? []}
              categoriesLoading={categories.isLoading}
              update={update}
              clear={clear}
            />
            <label className="store-sort">
              Sort by:
              <select value={sort} onChange={(event) => update('sort', event.target.value)}>
                <option value="newest">Newest</option>
                <option value="price-asc">Price, low to high</option>
                <option value="price-desc">Price, high to low</option>
              </select>
            </label>
            <span aria-live="polite">
              {query.data
                ? `${query.data.total} ${query.data.total === 1 ? 'product' : 'products'}`
                : ''}
            </span>
          </div>
        </>
      )}
      {query.isLoading && <StoreSkeleton variant="products" count={8} />}
      {query.isError && (
        <div className="flex justify-center py-5">
          <button className="button button-outline" onClick={() => void query.refetch()}>
            Retry loading products
          </button>
        </div>
      )}
      {!query.isLoading && !query.isError && !products.length && (
        <StoreStatus
          title="No products found"
          action={
            <button className="button button-outline" onClick={clear}>
              Clear filters
            </button>
          }
        >
          Try a different search or change your filters.
        </StoreStatus>
      )}
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {listing && (query.data?.totalPages ?? 0) > 1 && (
        <nav className="store-pagination" aria-label="Product pages">
          <button disabled={page <= 1} onClick={() => update('page', String(page - 1))}>
            Previous
          </button>
          <span aria-live="polite">
            Page {page} of {query.data?.totalPages}
          </span>
          <button
            disabled={page >= (query.data?.totalPages ?? 1)}
            onClick={() => update('page', String(page + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
