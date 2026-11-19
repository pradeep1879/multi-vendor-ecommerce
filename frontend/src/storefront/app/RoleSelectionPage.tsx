import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, ShoppingBag, Store } from 'lucide-react';
import { useAuth, type AuthRole } from '../features/auth/auth-state';
import { roleDestination } from './workspace-access';
import { useRoleSwitch } from './role-switch';
import './role-selection.css';

const roleDetails: Record<AuthRole, { title: string; description: string; icon: typeof Store }> = {
  CUSTOMER: {
    title: 'Customer storefront',
    description: 'Browse the collection, manage your orders and saved items.',
    icon: ShoppingBag,
  },
  VENDOR: {
    title: 'Vendor workspace',
    description: 'Manage your store, products and fulfillment.',
    icon: Store,
  },
  ADMIN: {
    title: 'Admin dashboard',
    description: 'Manage marketplace operations and review activity.',
    icon: ShieldCheck,
  },
};

export function RoleSwitchControl() {
  const auth = useAuth();
  const changeRole = useRoleSwitch();
  if (!auth.data || auth.data.roles.length < 2) return null;
  return (
    <details className="role-switch-control">
      <summary>Switch workspace</summary>
      <div className="role-switch-menu">
        {auth.data.roles.map((role) => {
          const Icon = roleDetails[role].icon;
          return (
            <button
              type="button"
              key={role}
              disabled={changeRole.isPending || auth.data.role === role}
              onClick={() => changeRole.mutate(role)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{roleDetails[role].title}</span>
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function RoleSelectionPage() {
  const auth = useAuth();
  const changeRole = useRoleSwitch();
  if (auth.isLoading) return <div className="role-selection-loading">Loading your account…</div>;
  if (!auth.data) return <Navigate to="/login" replace />;
  if (auth.data.roles.length === 1)
    return <Navigate to={roleDestination(auth.data.roles[0], auth.data.vendorStatus)} replace />;

  return (
    <main className="role-selection-page">
      <section className="role-selection-card" aria-labelledby="role-selection-title">
        <span className="role-selection-eyebrow">MAISON BEAUTÉ · YOUR ACCOUNT</span>
        <h1 id="role-selection-title">Where would you like to go?</h1>
        <p>You can switch between these workspaces whenever you need.</p>
        <div className="role-selection-options">
          {auth.data.roles.map((role) => {
            const Icon = roleDetails[role].icon;
            const pendingVendor = role === 'VENDOR' && auth.data?.vendorStatus !== 'APPROVED';
            return (
              <button
                type="button"
                className="role-selection-option"
                key={role}
                disabled={changeRole.isPending}
                onClick={() => changeRole.mutate(role)}
              >
                <span className="role-selection-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="role-selection-copy">
                  <strong>{roleDetails[role].title}</strong>
                  <small>
                    {pendingVendor
                      ? 'Your vendor application is awaiting review.'
                      : roleDetails[role].description}
                  </small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {changeRole.isPending && (
          <div className="role-selection-status" role="status">
            Opening workspace…
          </div>
        )}
      </section>
    </main>
  );
}

export function VendorApplicationStatusPage() {
  const auth = useAuth();
  if (auth.isLoading) return <div className="role-selection-loading">Loading your account…</div>;
  if (!auth.data) return <Navigate to="/vendor/login" replace />;
  if (!auth.data.roles.includes('VENDOR'))
    return <Navigate to={roleDestination(auth.data.role, auth.data.vendorStatus)} replace />;
  if (auth.data.vendorStatus === 'APPROVED') return <Navigate to="/vendor/dashboard" replace />;
  const status = auth.data.vendorStatus ?? 'PENDING';
  return (
    <main className="role-selection-page">
      <section className="role-selection-card role-selection-status-card">
        <span className="role-selection-eyebrow">VENDOR APPLICATION · {status}</span>
        <h1>
          {status === 'REJECTED'
            ? 'Your application needs an update.'
            : status === 'SUSPENDED'
              ? 'Your store is currently paused.'
              : 'Your store is under review.'}
        </h1>
        <p>
          {status === 'REJECTED'
            ? 'Review the decision in your application details and contact marketplace support to submit an updated application.'
            : status === 'SUSPENDED'
              ? 'Vendor tools are unavailable while your store is suspended. Contact marketplace support for help.'
              : 'We’ll make your vendor workspace available as soon as an administrator approves your application.'}
        </p>
        <Link className="role-selection-back" to="/">
          Return to the storefront <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}
