import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const heroPoster =
  'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=1920&q=85';

export function Hero() {
  return (
    <section className="store-hero" aria-labelledby="home-title">
      <div className="store-hero-media" aria-hidden="true">
        <img
          className="store-hero-poster"
          src={heroPoster}
          alt=""
          fetchPriority="high"
          width="1920"
          height="1080"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      </div>

      <div className="store-hero-content store-container">
        <div className="store-hero-copy">
          <p className="store-hero-eyebrow">THE EVERYDAY EDIT</p>
          <h1 id="home-title">Beauty, at your own pace.</h1>
          <p className="store-hero-description">
            Your moment to explore makeup, skincare and fragrance that feel like you.
          </p>
          <Link to="/products" className="button store-hero-cta">
            Shop the collection <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <span className="store-hero-index" aria-hidden="true">
        01 / THE COLLECTION
      </span>
    </section>
  );
}
