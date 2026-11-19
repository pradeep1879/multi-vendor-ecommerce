import type { Product } from '../../types/domain';
import { formatPaise } from '../../lib/api-client';

type Props = {
  product: Product;
  authenticated: boolean;
  busy: boolean;
  onView: () => void;
  onAddToCart: () => void;
  saved: boolean;
  onToggleFavorite: () => void;
};

export function ProductCard({
  product,
  authenticated,
  busy,
  onView,
  onAddToCart,
  saved,
  onToggleFavorite,
}: Props) {
  const outOfStock = (product.inventory?.available ?? 0) <= 0;
  return (
    <article className="product-card">
      <div className="product-image-wrap">
        <button className="product-image" onClick={onView} aria-label={`View ${product.name}`}>
          {product.images?.[0]?.url ? (
            <img
              src={product.images[0].url}
              alt={product.images[0].altText ?? product.name}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span>{product.name.slice(0, 1)}</span>
          )}
        </button>
        <button
          className={`favorite-button ${saved ? 'saved' : ''}`}
          aria-label={`${saved ? 'Remove' : 'Save'} ${product.name} ${saved ? 'from' : 'to'} favorites`}
          aria-pressed={saved}
          onClick={onToggleFavorite}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="heart-icon">
            <path d="M20.8 8.7c0 5-8.8 10.2-8.8 10.2S3.2 13.7 3.2 8.7a4.5 4.5 0 0 1 8.8-1.1 4.5 4.5 0 0 1 8.8 1.1Z" />
          </svg>
        </button>
      </div>
      <div className="product-card-heading">
        <h3>
          <button className="text-button" onClick={onView}>
            {product.name}
          </button>
        </h3>
        <strong className="product-card-price">{formatPaise(product.pricePaise)}</strong>
      </div>
      <p className="product-subtitle">{product.description}</p>
      {product.compareAtPricePaise && (
        <del className="product-card-compare">{formatPaise(product.compareAtPricePaise)}</del>
      )}
      <button
        className="button primary product-add-button"
        disabled={busy || outOfStock}
        onClick={onAddToCart}
      >
        {outOfStock ? 'Out of stock' : authenticated ? 'Add to cart' : 'Sign in to add'}
      </button>
    </article>
  );
}
