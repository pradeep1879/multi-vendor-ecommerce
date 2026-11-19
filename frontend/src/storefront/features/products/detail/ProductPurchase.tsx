import { useState } from 'react';
import { Heart, RotateCcw, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CatalogProduct, CatalogVariant } from '../../../types/catalog';
import { ProductPrice, ProductRating } from '../../../components/storefront/Product/ProductPrice';
import { QuantitySelector } from '../../../components/storefront/Product/QuantitySelector';
import { useAddToCart } from '../../cart/use-add-to-cart';
import { useWishlistToggle } from '../use-wishlist';

export function ProductPurchase({
  product,
  variant,
  onVariant,
}: {
  product: CatalogProduct;
  variant: CatalogVariant;
  onVariant: (id: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [linkCopied, setLinkCopied] = useState(false);
  const cart = useAddToCart();
  const wishlist = useWishlistToggle(product);
  const stock = Math.max(0, variant.availableQuantity - variant.reservedQuantity);
  return (
    <section className="store-product-purchase">
      <p className="store-product-brand">{product.brand.name}</p>
      {product.vendorName && <p className="store-product-vendor">Sold by {product.vendorName}</p>}
      <h1>{product.name}</h1>
      {product.reviewCount > 0 && (
        <a href="#product-reviews">
          <ProductRating rating={product.rating} count={product.reviewCount} />
        </a>
      )}
      <ProductPrice pricePaise={variant.pricePaise} compareAtPaise={variant.compareAtPaise} />
      <p className="store-tax-note">Applicable taxes are shown when you place your order.</p>
      {product.shortDescription && <p>{product.shortDescription}</p>}
      {product.variants.length > 1 && (
        <fieldset className="store-variants">
          <legend>Option: {variant.name}</legend>
          <div>
            {product.variants.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={variant.id === item.id}
                onClick={() => {
                  onVariant(item.id);
                  setQuantity(1);
                }}
              >
                {item.name}
                {item.availableQuantity <= item.reservedQuantity ? ' · Sold out' : ''}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="store-purchase-quantity">
        <span>Quantity</span>
        <QuantitySelector
          value={quantity}
          max={stock}
          onChange={setQuantity}
          disabled={!stock || cart.isPending}
        />
      </div>
      <p className="store-stock">{stock ? `${stock} available` : 'Currently sold out'}</p>
      <button
        className="button button-dark store-purchase-add"
        disabled={!stock || cart.isPending}
        onClick={() =>
          cart.add(
            {
              product,
              variantId: variant.id,
              variantName: variant.name,
              sku: variant.sku,
              pricePaise: variant.pricePaise,
              compareAtPaise: variant.compareAtPaise,
              availableQuantity: stock,
            },
            quantity,
          )
        }
      >
        {!stock ? 'Sold out' : cart.isPending ? 'Adding…' : 'Add to bag'}
      </button>
      <button
        className="store-text-button store-purchase-save"
        aria-pressed={wishlist.saved}
        disabled={wishlist.isPending}
        onClick={wishlist.toggle}
      >
        <Heart size={17} fill={wishlist.saved ? 'currentColor' : 'none'} />
        {wishlist.saved ? 'Saved to wishlist' : 'Save to wishlist'}
      </button>
      <button
        className="store-text-button store-purchase-save"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setLinkCopied(true);
            window.setTimeout(() => setLinkCopied(false), 2000);
          } catch {
            setLinkCopied(false);
          }
        }}
      >
        <Share2 size={17} />
        {linkCopied ? 'Product link copied' : 'Copy product link'}
      </button>
      <span className="sr-only" aria-live="polite">
        {linkCopied ? 'Product link copied to clipboard.' : ''}
      </span>
      <div className="store-delivery">
        <p>
          <RotateCcw size={19} />
          <span>
            Manage eligible returns from <Link to="/account/orders">your orders</Link>.
          </span>
        </p>
      </div>
    </section>
  );
}
