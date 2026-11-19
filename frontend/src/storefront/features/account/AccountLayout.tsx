import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LogOut,
  Bell,
  Heart,
  MapPin,
  Package,
  RotateCcw,
  Shield,
  UserRound,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { StoreShell } from '../../components/storefront/StoreShell';
import { RoleSwitchControl } from '../../app/RoleSelectionPage';
import { logoutCurrentSession } from '../auth/auth-state';

const sections = [
  {
    label: 'Your activity',
    links: [
      { to: '/account', label: 'Overview', icon: UserRound, end: true },
      { to: '/account/orders', label: 'My orders', icon: Package },
      { to: '/account/wishlist', label: 'Wishlist', icon: Heart },
    ],
  },
  {
    label: 'Orders & feedback',
    links: [
      { to: '/account/addresses', label: 'Addresses', icon: MapPin },
      { to: '/account/returns', label: 'Returns', icon: RotateCcw },
      { to: '/account/refunds', label: 'Refunds', icon: RotateCcw },
      { to: '/account/reviews', label: 'My reviews', icon: Star },
    ],
  },
  {
    label: 'Account settings',
    links: [
      { to: '/account/profile', label: 'Profile', icon: UserRound },
      { to: '/account/notifications', label: 'Notifications', icon: Bell },
      { to: '/account/security', label: 'Security', icon: Shield },
      { to: '/account/preferences', label: 'Preferences', icon: SlidersHorizontal },
    ],
  },
];
const links = sections.flatMap((section) => section.links);

export function AccountLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await logoutCurrentSession(queryClient);
    } finally {
      navigate('/login');
      setBusy(false);
    }
  }
  return (
    <StoreShell>
      <div className="store-container store-account">
        <div className="store-account-heading">
          <h1>My account</h1>
          <RoleSwitchControl />
          <button onClick={() => void logout()} disabled={busy}>
            <LogOut size={16} />
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        <label className="store-account-mobile">
          Account section
          <select
            value={
              links.find(
                (link) =>
                  location.pathname === link.to ||
                  (!link.end && location.pathname.startsWith(link.to + '/')),
              )?.to ?? '/account'
            }
            onChange={(event) => navigate(event.target.value)}
          >
            {sections.map((section) => (
              <optgroup key={section.label} label={section.label}>
                {section.links.map((link) => (
                  <option key={link.to} value={link.to}>
                    {link.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="store-account-layout">
          <aside>
            <nav aria-label="Customer account">
              {sections.map((section) => (
                <div className="store-account-nav-section" key={section.label}>
                  <p className="store-account-nav-label">{section.label}</p>
                  {section.links.map(({ to, label, icon: Icon, end }) => (
                    <NavLink key={to} to={to} end={end}>
                      <Icon size={17} strokeWidth={1.5} />
                      {label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          </aside>
          <div className="store-account-content">
            <Outlet />
          </div>
        </div>
      </div>
    </StoreShell>
  );
}
