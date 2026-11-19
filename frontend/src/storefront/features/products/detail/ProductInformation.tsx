import type { CatalogProduct } from '../../../types/catalog';
import { ProductRating } from '../../../components/storefront/Product/ProductPrice';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';

export function ProductInformation({ product }: { product: CatalogProduct }) {
  const hasInformation = Boolean(
    product.description ||
    product.benefits?.length ||
    product.ingredients?.length ||
    product.howToUse ||
    product.warnings,
  );
  if (!hasInformation) return null;
  return (
    <section className="store-product-information" aria-label="Product information">
      {product.description && (
        <details open>
          <summary>About this product</summary>
          <p>{product.description}</p>
        </details>
      )}
      {!!product.benefits?.length && (
        <details>
          <summary>Benefits</summary>
          <ul>
            {product.benefits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
      {!!product.ingredients?.length && (
        <details>
          <summary>Ingredients</summary>
          <p>{product.ingredients.join(', ')}</p>
        </details>
      )}
      {product.howToUse && (
        <details>
          <summary>How to use</summary>
          <p>{product.howToUse}</p>
        </details>
      )}
      {product.warnings && (
        <details>
          <summary>Good to know</summary>
          <p>{product.warnings}</p>
        </details>
      )}
    </section>
  );
}

export function ProductReviews({ product }: { product: CatalogProduct }) {
  const reviews = useQuery({
    queryKey: ['product-reviews', product.id],
    queryFn: async () => {
      const response = await api.get<{
        data: {
          reviews: Array<{
            id: string;
            rating: number;
            title: string | null;
            body: string | null;
            createdAt: string;
            user: { name: string };
          }>;
          meta: { total: number };
        };
      }>(`/products/${product.id}/reviews`, { params: { pageSize: 20 } });
      return response.data.data;
    },
    enabled: Boolean(product.id),
    retry: false,
  });
  const items = reviews.data?.reviews ?? [];
  const count = reviews.data?.meta.total ?? product.reviewCount;
  return (
    <section className="store-reviews" id="product-reviews">
      <h2>Customer reviews{count ? ` (${count})` : ''}</h2>
      {count ? (
        <ProductRating rating={product.rating} count={count} />
      ) : (
        <p>No published reviews yet.</p>
      )}
      {reviews.isLoading && (
        <div className="store-review-skeleton" role="status" aria-label="Loading reviews">
          <span />
          <span />
          <span />
        </div>
      )}
      <div>
        {items.map((review) => (
          <article key={review.id}>
            <ProductRating rating={review.rating} count={1} />
            {review.title && <h3>{review.title}</h3>}
            <p>{review.body}</p>
            <small>
              {review.user.name} · {new Date(review.createdAt).toLocaleDateString()}
              {' · Verified purchase'}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
