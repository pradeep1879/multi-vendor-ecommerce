import { Link } from 'react-router-dom';
import { Sparkles, RotateCcw, ShieldCheck, PackageCheck } from 'lucide-react';

export function Story() {
  return (
    <section className="store-story store-container store-section" id="journal">
      <img
        src="https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1400&q=88"
        alt="Thoughtfully arranged everyday objects in a warm, natural interior"
        loading="lazy"
      />
      <div>
        <p className="eyebrow">About Aster Market</p>
        <h2>Everyday finds, chosen with care.</h2>
        <p>
          A good marketplace makes it easier to find the things that make home, work, and daily life
          feel a little more like yours.
        </p>
        <p>
          We bring independent sellers and useful, well-made products together, so you can spend less
          time searching and more time enjoying what you find.
        </p>
        <span className="store-story-signature">With care, Aster Market</span>
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
