import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CartLine } from '../../stores/cart';
import { currency } from '../../lib/commerce-format';
import { QuantitySelector } from '../../components/storefront/Product/QuantitySelector';

export function CartItem({
  line,
  changeQuantity,
  remove,
  onNavigate,
}: {
  line: CartLine;
  changeQuantity: (id: string, value: number) => void;
  remove: (id: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <article className="store-cart-item">
      <Link className="store-cart-image" to={`/products/${line.product.slug}`} onClick={onNavigate}>
        {line.product.image ? (
          <img src={line.product.image} alt={line.product.name} />
        ) : (
          <span>No image</span>
        )}
      </Link>
      <div className="store-cart-copy">
        <p className="store-product-brand">{line.product.brand.name}</p>
        <h2>
          <Link to={`/products/${line.product.slug}`} onClick={onNavigate}>
            {line.product.name}
          </Link>
        </h2>
        <p>{line.variantName}</p>
        <p>{currency.format(line.pricePaise / 100)}</p>
        <div className="store-cart-controls">
          <QuantitySelector
            value={line.quantity}
            max={line.availableQuantity}
            onChange={(value) => changeQuantity(line.variantId, value)}
            label={`Quantity for ${line.product.name}`}
          />
          <button
            type="button"
            aria-label={`Remove ${line.product.name}`}
            onClick={() => remove(line.variantId)}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      <strong className="store-cart-line-total">
        {currency.format((line.pricePaise * line.quantity) / 100)}
      </strong>
    </article>
  );
}
