import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { StoreShell } from '../components/storefront/StoreShell';
import { StoreStatus, StoreSkeleton } from '../components/storefront/StoreStatus';
import { CartItem } from '../features/cart/CartItem';
import { useCartView } from '../features/cart/use-cart-view';
import { useCheckout } from '../features/checkout/use-checkout';
import { AddressFields } from '../features/checkout/AddressFields';
import { PaymentMethods } from '../features/checkout/PaymentMethods';
import { OrderSummary, CheckoutSteps } from '../features/checkout/OrderSummary';
import { showToast } from '../../components/feedback/toast';

const shopLink = (
  <Link className="button button-dark" to="/products">
    Continue shopping
  </Link>
);

function CheckoutSkeleton() {
  return (
    <div className="store-checkout-skeleton" role="status" aria-label="Loading checkout">
      <span className="sr-only">Loading checkout</span>
      <div className="store-checkout-skeleton-details">
        <i className="heading" />
        <i className="contact" />
        <i className="heading" />
        <div className="fields">
          {Array.from({ length: 6 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <i className="heading" />
        <i className="payment" />
      </div>
      <div className="store-checkout-skeleton-summary">
        <i className="heading" />
        {Array.from({ length: 3 }, (_, index) => (
          <i className="item" key={index} />
        ))}
        <i className="total" />
        <i className="button" />
      </div>
    </div>
  );
}

export function CartPage() {
  const cart = useCartView();
  const list = Object.values(cart.lines);
  const subtotal = list.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0);
  return (
    <StoreShell>
      <div className="store-container store-commerce">
        <CheckoutSteps active="cart" />
        <div className="store-commerce-title">
          <h1>Your shopping bag</h1>
          <Link to="/products">Continue shopping</Link>
        </div>
        {cart.isLoading ? (
          <StoreSkeleton />
        ) : !list.length ? (
          <StoreStatus title="Your bag is empty" action={shopLink}>
            Discover something for your everyday routine.
          </StoreStatus>
        ) : (
          <div className="store-cart-layout">
            <section aria-label="Shopping bag items">
              {list.map((line) => (
                <CartItem
                  key={line.variantId}
                  line={line}
                  changeQuantity={cart.changeQuantity}
                  remove={cart.remove}
                />
              ))}
            </section>
            <OrderSummary subtotal={subtotal}>
              <Link className="button button-dark" to="/checkout">
                Checkout
              </Link>
            </OrderSummary>
          </div>
        )}
      </div>
    </StoreShell>
  );
}

export function CheckoutPage() {
  const flow = useCheckout();
  useEffect(() => {
    if (flow.paymentMessage && !flow.paymentMessage.includes('Verifying')) {
      showToast(flow.paymentMessage, 'error');
    }
  }, [flow.paymentMessage]);
  const busy = flow.checkout.isPending || flow.checkoutOpen || flow.verifying;
  const label = flow.checkout.isPending
    ? 'Preparing checkout…'
    : flow.verifying
      ? 'Verifying payment…'
      : flow.checkoutOpen
        ? 'Complete payment in Razorpay…'
        : 'Pay securely with Razorpay';
  return (
    <StoreShell>
      <div className="store-container store-commerce store-checkout-page">
        <CheckoutSteps active="checkout" />
        <div className="store-commerce-title">
          <h1>Checkout</h1>
          <Link to="/cart">Return to bag</Link>
        </div>
        <p className="store-checkout-intro">Enter your details, then pay securely.</p>
        {flow.auth.isLoading ? (
          <CheckoutSkeleton />
        ) : !flow.auth.data ? (
          <StoreStatus
            title="Sign in to checkout"
            action={
              <Link className="button button-dark" to="/login" state={{ from: '/checkout' }}>
                Sign in or create an account
              </Link>
            }
          >
            Keep your orders, tracking and receipts together in your account.
          </StoreStatus>
        ) : flow.cart.isLoading ? (
          <CheckoutSkeleton />
        ) : !flow.list.length ? (
          <StoreStatus title="Your bag is empty" action={shopLink} />
        ) : (
          <form className="store-checkout-layout" onSubmit={(event) => void flow.submit(event)}>
            <fieldset className="store-checkout-details" disabled={busy}>
              <div className="store-checkout-contact">
                <h2>Contact</h2>
                <p>
                  <span>{flow.auth.data.email}</span>
                </p>
              </div>
              <AddressFields address={flow.address} update={flow.update} />
              <PaymentMethods
                value={flow.paymentMethod}
                onChange={flow.setPaymentMethod}
                disabled={busy}
              />
            </fieldset>
            <OrderSummary list={flow.list} subtotal={flow.subtotal}>
              <button className="button button-dark" disabled={busy} type="submit">
                {label}
              </button>
            </OrderSummary>
          </form>
        )}
      </div>
    </StoreShell>
  );
}
