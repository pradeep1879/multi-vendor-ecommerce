import { Link } from 'react-router-dom';
import { currency } from '../../lib/commerce-format';
import { useCart } from '../../stores/cart';
import { useCartView } from './use-cart-view';
import { Overlay } from '../../components/storefront/Overlay';
import { StoreSkeleton, StoreStatus } from '../../components/storefront/StoreStatus';
import { CartItem } from './CartItem';

export function BagDrawer() {
  const cart = useCartView();
  const isOpen = useCart((state) => state.isOpen);
  const setOpen = useCart((state) => state.setOpen);
  const close = () => setOpen(false);
  const list = Object.values(cart.lines);
  const total = list.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0);
  return (
    <Overlay
      open={isOpen}
      onClose={close}
      title="Your shopping bag"
      side="right"
      className="store-bag-overlay"
    >
      {cart.isLoading ? (
        <StoreSkeleton variant="lines" />
      ) : cart.error ? (
        <StoreStatus title="We couldn’t load your bag">Please try again.</StoreStatus>
      ) : !list.length ? (
        <StoreStatus
          title="Your bag is empty"
          action={
            <Link to="/products" onClick={close} className="button button-dark">
              Explore products
            </Link>
          }
        />
      ) : (
        <div className="store-bag-content">
          <div className="store-bag-items">
            {list.map((line) => (
              <CartItem
                key={line.variantId}
                line={line}
                changeQuantity={cart.changeQuantity}
                remove={cart.remove}
                onNavigate={close}
              />
            ))}
          </div>
          <div className="store-bag-summary">
            <div>
              <span>Estimated subtotal</span>
              <strong>{currency.format(total / 100)}</strong>
            </div>
            <p>Applicable product taxes are confirmed before payment.</p>
            <Link className="button button-dark" to="/checkout" onClick={close}>
              Checkout
            </Link>
            <Link className="store-text-button" to="/cart" onClick={close}>
              View shopping bag
            </Link>
          </div>
        </div>
      )}
    </Overlay>
  );
}
