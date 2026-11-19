import type { ReactNode } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CartLine } from '../../stores/cart';
import { currency } from '../../lib/commerce-format';

export function OrderSummary({
  list,
  subtotal,
  children,
}: {
  list?: CartLine[];
  subtotal: number;
  children: ReactNode;
}) {
  return (
    <aside className="store-order-summary">
      <h2>Order summary</h2>
      {list && (
        <div className="store-summary-items">
          {list.map((line) => (
            <div key={line.variantId}>
              {line.product.image && <img src={line.product.image} alt="" />}
              <span>
                {line.product.name}
                <small>
                  {line.variantName} · Qty {line.quantity}
                </small>
              </span>
              <strong>{currency.format((line.pricePaise * line.quantity) / 100)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="store-summary-total">
        <span>Estimated subtotal</span>
        <strong>{currency.format(subtotal / 100)}</strong>
      </div>
      <p>Applicable taxes, discounts and product availability are confirmed before payment.</p>
      {children}
      <div className="store-checkout-secure-note">
        <LockKeyhole size={15} aria-hidden="true" />
        <span>Secure payment processed by Razorpay</span>
      </div>
    </aside>
  );
}

export function CheckoutSteps({ active }: { active: 'cart' | 'checkout' }) {
  return (
    <nav className="store-checkout-steps" aria-label="Checkout progress">
      <Link aria-current={active === 'cart' ? 'step' : undefined} to="/cart">
        1. Shopping bag
      </Link>
      <span>/</span>
      <span aria-current={active === 'checkout' ? 'step' : undefined}>2. Checkout</span>
      <span>/</span>
      <span>3. Confirmation</span>
    </nav>
  );
}
