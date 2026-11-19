import { Heart, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product } from '../types/catalog';
import { useAddToCart } from '../features/cart/use-add-to-cart';
import { discountPercent } from '../features/products/catalog';
import { useWishlistToggle } from '../features/products/use-wishlist';
import { ProductPrice, ProductRating } from './storefront/Product/ProductPrice';

export function ProductCard({ product }: { product: Product }) {
  const { add, isPending } = useAddToCart();
  const wishlist = useWishlistToggle(product);
  const discount = discountPercent(product.pricePaise, product.compareAtPaise);
  const availableQuantity = product.availableQuantity ?? 0;
  const soldOut = availableQuantity <= 0 || !product.variantId;
  return (
    <article className="store-product">
      <div className="store-product-media">
        <Link to={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
          {product.image ? (
            <img src={product.image} alt={product.name} loading="lazy" />
          ) : (
            <span>Image unavailable</span>
          )}
        </Link>
        {(soldOut || discount > 0) && (
          <span className="store-badge">{soldOut ? 'Sold out' : `Sale · ${discount}% off`}</span>
        )}
        <button
          className="store-product-heart"
          aria-label={`${wishlist.saved ? 'Remove' : 'Save'} ${product.name}`}
          aria-pressed={wishlist.saved}
          disabled={wishlist.isPending}
          onClick={wishlist.toggle}
        >
          <Heart size={18} strokeWidth={1.5} fill={wishlist.saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="store-product-copy">
        <p className="store-product-brand">{product.brand.name}</p>
        {product.vendorName && <p className="store-product-vendor">Sold by {product.vendorName}</p>}
        <h3>
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <ProductPrice pricePaise={product.pricePaise} compareAtPaise={product.compareAtPaise} />
        <ProductRating rating={product.rating} count={product.reviewCount} />
        <button
          className="store-quick-add"
          disabled={soldOut || isPending}
          onClick={() =>
            add({
              product,
              variantId: product.variantId!,
              variantName: product.variantName ?? '',
              sku: product.sku ?? '',
              pricePaise: product.pricePaise,
              compareAtPaise: product.compareAtPaise ?? null,
              availableQuantity,
            })
          }
        >
          <Plus size={14} />
          {soldOut ? 'Sold out' : isPending ? 'Adding…' : 'Add to bag'}
        </button>
      </div>
    </article>
  );
}
