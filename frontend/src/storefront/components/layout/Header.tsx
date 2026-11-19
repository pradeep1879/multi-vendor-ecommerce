import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Heart, Menu, ShoppingBag, UserRound } from 'lucide-react';
import { useCart } from '../../stores/cart';
import { Wordmark } from '../storefront/Wordmark';
import { useCategories, useHeaderData } from '../storefront/Header/use-header-data';
import { DesktopNavigation, MobileNavigation } from '../storefront/Header/Navigation';

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const setCartOpen = useCart((state) => state.setOpen);
  const { count, favoriteCount } = useHeaderData();
  const categories = useCategories();
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="store-announcement">Thoughtful finds for your everyday</div>
      <header className="store-header">
        <div className="store-header-inner store-container">
          <div className="store-mobile-actions">
            <button
              className="store-icon"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <Menu size={24} strokeWidth={1.25} />
            </button>
          </div>
          <Wordmark />
          <DesktopNavigation categories={categories.data ?? []} />
          <div className="store-header-actions">
            <Link to="/sell-with-us" className="store-seller-link">
              Become a seller <span aria-hidden="true">↗</span>
            </Link>
            <Link to="/account" className="store-icon" aria-label="My account">
              <UserRound size={23} strokeWidth={1.25} />
            </Link>
            <Link
              to="/wishlist"
              className="store-icon store-header-wishlist"
              aria-label={`Wishlist, ${favoriteCount} items`}
            >
              <Heart size={23} strokeWidth={1.25} />
              {favoriteCount > 0 && <span className="store-count">{favoriteCount}</span>}
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="store-icon"
              aria-label={`Shopping bag, ${count} items`}
            >
              <ShoppingBag size={23} strokeWidth={1.25} />
              {count > 0 && <span className="store-count">{count}</span>}
            </button>
          </div>
        </div>
      </header>
      <MobileNavigation
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        categories={categories.data ?? []}
      />
    </>
  );
}
