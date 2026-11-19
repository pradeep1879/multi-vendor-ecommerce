import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const heroPoster =
  'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=2200&q=90';

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
          <p className="store-hero-eyebrow">Good things, thoughtfully found</p>
          <h1 id="home-title">Find more of what you love.</h1>
          <p className="store-hero-description">
            Explore considered finds for your home, your day, and everything in between.
          </p>
          <Link to="/products" className="button store-hero-cta">
            Explore the marketplace <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <span className="store-hero-index" aria-hidden="true">
        01 / Curated finds
      </span>
    </section>
  );
}
