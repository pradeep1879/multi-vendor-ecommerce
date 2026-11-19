import { Link } from 'react-router-dom';
import { Sparkles, RotateCcw, ShieldCheck, PackageCheck } from 'lucide-react';

export function Story() {
  return (
    <section className="store-story store-container store-section" id="journal">
      <img
        src="https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=1100&q=80"
        alt="A quiet skincare ritual in a natural setting"
        loading="lazy"
      />
      <div>
        <p className="eyebrow">ABOUT MAISON BEAUTÉ</p>
        <h2>Less, but more lovely.</h2>
        <p>
          We believe your routine should feel less like another thing to get right, and more like a
          small kindness you give yourself.
        </p>
        <p>
          Every formula is made with intention: a few thoughtful ingredients, a sensorial texture,
          and nothing you don't need.
        </p>
        <span className="store-story-signature">With care, Maison Beauté</span>
      </div>
    </section>
  );
}
export function StoreBenefits() {
  return (
    <section className="store-benefits store-container store-section">
      <h2>Here for your everyday</h2>
      <div className="store-benefits-grid">
        <article>
          <Sparkles strokeWidth={1.25} />
          <h3>Considered essentials</h3>
          <p>Thoughtful products from independent sellers, selected for your everyday.</p>
        </article>
        <article>
          <ShieldCheck strokeWidth={1.25} />
          <h3>Secure online payment</h3>
          <p>Complete checkout with server-verified Razorpay payment.</p>
        </article>
        <article>
          <PackageCheck strokeWidth={1.25} />
          <h3>Keep track of your order</h3>
          <Link className="store-text-link" to="/account/orders">
            View orders & delivery updates
          </Link>
        </article>
        <article>
          <RotateCcw strokeWidth={1.25} />
          <h3>Returns & refunds</h3>
          <p>Manage eligible returns from your account.</p>
          <Link className="store-text-link" to="/account/returns">
            Manage returns
          </Link>
        </article>
      </div>
    </section>
  );
}
