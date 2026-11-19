import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Wordmark } from '../storefront/Wordmark';
import { useCategories } from '../storefront/Header/use-header-data';

export function Footer() {
  const categories = useCategories();
  return (
    <footer className="store-footer" id="contact">
      <div className="store-container">
        <div className="store-footer-columns">
          <section>
            <h2>Quick links</h2>
            <ul>
              <li>
                <Link to="/search">Search</Link>
              </li>
              <li>
                <a href="/#journal">About Aster Market</a>
              </li>
              <li>
                <Link to="/products">Shop all</Link>
              </li>
              <li>
                <Link to="/account/orders">Track your order</Link>
              </li>
              <li>
                <Link to="/account/returns">Returns & refunds</Link>
              </li>
            </ul>
          </section>
          <section>
            <h2>Explore</h2>
            <ul>
              {categories.data?.slice(0, 6).map((category) => (
                <li key={category.id}>
                  <Link to={`/products?category=${encodeURIComponent(category.slug)}`}>
                    {category.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/wishlist">Your wishlist</Link>
              </li>
              <li>
                <Link to="/account">My account</Link>
              </li>
            </ul>
          </section>
          <section className="store-footer-brand">
            <Wordmark />
            <p>
              Thoughtful finds for everyday living.
              <br />
              Made with care, for real life.
            </p>
            <Link to="/products" className="store-text-link">
              Find your everyday essentials <ArrowRight size={17} />
            </Link>
          </section>
        </div>
        <div className="store-footer-bottom">
          <span>© {new Date().getFullYear()} Aster Market</span>
          <span>INR ₹ · India</span>
          <Link to="/account/preferences">Email preferences</Link>
          <Link to="/account/security">Account security</Link>
        </div>
      </div>
    </footer>
  );
}
