import { useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Overlay } from '../Overlay';
import type { StoreCategory } from './use-header-data';

function CategoryLinks({
  categories,
  onNavigate,
}: {
  categories: StoreCategory[];
  onNavigate?: () => void;
}) {
  return (
    <ul className="store-category-links">
      <li>
        <Link to="/products" onClick={onNavigate}>
          Shop all
        </Link>
      </li>
      {categories.map((category) => (
        <li key={category.id} className={category.parentId ? 'store-category-child' : ''}>
          <Link to={`/products?category=${encodeURIComponent(category.slug)}`} onClick={onNavigate}>
            {category.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
export function DesktopNavigation({ categories }: { categories: StoreCategory[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <nav className="store-desktop-nav" aria-label="Main navigation">
      <NavLink to="/" end>
        Home
      </NavLink>
      <a href="/#journal">About us</a>
      <details
        ref={menu}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menu.current) {
            menu.current.open = false;
            menu.current.querySelector('summary')?.focus();
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            event.currentTarget.open = false;
        }}
      >
        <summary>
          Catalog <ChevronDown size={12} />
        </summary>
        <CategoryLinks
          categories={categories}
          onNavigate={() => {
            if (menu.current) menu.current.open = false;
          }}
        />
      </details>
      <NavLink to="/account/orders">Track order</NavLink>
      <NavLink to="/account/returns">Returns</NavLink>
    </nav>
  );
}
export function MobileNavigation({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: StoreCategory[];
}) {
  return (
    <Overlay open={open} onClose={onClose} title="Menu" side="left" className="store-mobile-nav">
      <nav aria-label="Mobile navigation">
        <Link to="/" onClick={onClose}>
          Home
        </Link>
        <a href="/#journal" onClick={onClose}>
          About us
        </a>
        <details open>
          <summary>
            Catalog <ChevronDown size={16} />
          </summary>
          <CategoryLinks categories={categories} onNavigate={onClose} />
        </details>
        <Link to="/account/orders" onClick={onClose}>
          Track order
        </Link>
        <Link to="/account/returns" onClick={onClose}>
          Returns & refunds
        </Link>
        <Link to="/wishlist" onClick={onClose}>
          Wishlist
        </Link>
        <Link to="/sell-with-us" onClick={onClose}>
          Become a seller
        </Link>
        <Link to="/account" onClick={onClose}>
          My account
        </Link>
      </nav>
    </Overlay>
  );
}
