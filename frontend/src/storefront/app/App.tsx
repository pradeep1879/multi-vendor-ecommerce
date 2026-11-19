import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { StorefrontPage } from '../pages/StorefrontPage';
import { useAuth } from '../features/auth/auth-state';
import { Navigate, useLocation, useNavigationType, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ProductListingPage } from '../pages/ProductListingPage';
import { ProductDetailPage } from '../pages/ProductDetailPage';
import { CartPage, CheckoutPage } from '../pages/CartCheckoutPages';
import { WishlistPage as StorefrontWishlistPage } from '../pages/WishlistPage';
import { VendorApplicationPage } from '../pages/VendorApplicationPage';
import { roleDestination } from './workspace-access';

const WorkspaceGate = lazy(() =>
  import('./Workspace').then((module) => ({ default: module.WorkspaceGate })),
);
const WorkspaceLoginGate = lazy(() =>
  import('./WorkspaceLoginPage').then((module) => ({ default: module.WorkspaceLoginGate })),
);

const AccountLayout = lazy(() =>
  import('../features/account/AccountLayout').then((module) => ({ default: module.AccountLayout })),
);
const AccountOverviewPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({
    default: module.AccountOverviewPage,
  })),
);
const AddressesPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({ default: module.AddressesPage })),
);
const NotificationsPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({
    default: module.NotificationsPage,
  })),
);
const OrderDetailPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({
    default: module.OrderDetailPage,
  })),
);
const OrdersPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({ default: module.OrdersPage })),
);
const PreferencesPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({
    default: module.PreferencesPage,
  })),
);
const ProfilePage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({ default: module.ProfilePage })),
);
const RefundsPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({ default: module.RefundsPage })),
);
const ReturnsPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({ default: module.ReturnsPage })),
);
const ReviewsPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({ default: module.ReviewsPage })),
);
const WishlistPage = lazy(() =>
  import('../features/account/AccountPages').then((module) => ({ default: module.WishlistPage })),
);
const AccountSecurityPage = lazy(() =>
  import('../features/auth/AuthForms').then((module) => ({ default: module.AccountSecurityPage })),
);
const ForgotPasswordForm = lazy(() =>
  import('../features/auth/AuthForms').then((module) => ({ default: module.ForgotPasswordForm })),
);
const LoginForm = lazy(() =>
  import('../features/auth/AuthForms').then((module) => ({ default: module.LoginForm })),
);
const ResetPasswordForm = lazy(() =>
  import('../features/auth/AuthForms').then((module) => ({ default: module.ResetPasswordForm })),
);
const SignupForm = lazy(() =>
  import('../features/auth/AuthForms').then((module) => ({ default: module.SignupForm })),
);
const VerifyEmailPage = lazy(() =>
  import('../features/auth/AuthForms').then((module) => ({ default: module.VerifyEmailPage })),
);
const RoleSelectionPage = lazy(() =>
  import('./RoleSelectionPage').then((module) => ({ default: module.RoleSelectionPage })),
);
const VendorApplicationStatusPage = lazy(() =>
  import('./RoleSelectionPage').then((module) => ({ default: module.VendorApplicationStatusPage })),
);

function Authenticated({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading)
    return (
      <div className="auth-loading" role="status">
        Checking session…
      </div>
    );
  if (!auth.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!auth.data.roles.includes('CUSTOMER'))
    return <Navigate to={roleDestination(auth.data.role, auth.data.vendorStatus)} replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const auth = useAuth();
  const location = useLocation();
  const requestedPath = (location.state as { from?: string } | null)?.from ?? '';
  const nextPath = new URLSearchParams(location.search).get('next') ?? '';
  const staffSwitch =
    requestedPath.startsWith('/admin') ||
    requestedPath.startsWith('/vendor') ||
    nextPath.startsWith('/admin') ||
    nextPath.startsWith('/vendor');
  if (auth.data) {
    if (staffSwitch) return <LoginForm currentUser={auth.data} />;
    if (auth.data.roles.length > 1) return <Navigate to="/select-role" replace />;
    return <Navigate to={roleDestination(auth.data.role, auth.data.vendorStatus)} replace />;
  }
  return <LoginForm />;
}

export default function App() {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === 'POP' || location.hash) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.search, location.hash, navigationType]);
  return (
    <div
      className={
        location.pathname.startsWith('/admin') ||
        location.pathname.startsWith('/vendor') ||
        location.pathname.startsWith('/marketplace')
          ? undefined
          : 'customer-store'
      }
    >
      <Suspense
        fallback={
          <div className="auth-loading" role="status">
            Loading page…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<StorefrontPage />} />
          <Route path="/products" element={<ProductListingPage />} />
          <Route path="/products/:slug" element={<ProductDetailPage />} />
          <Route path="/search" element={<ProductListingPage />} />
          <Route path="/category/:category" element={<CategoryListingRoute />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/wishlist" element={<StorefrontWishlistPage />} />
          <Route
            path="/sell-with-us"
            element={
              <Authenticated>
                <VendorApplicationPage />
              </Authenticated>
            }
          />
          {/* A valid customer session returns to the storefront; recovery stays independent. */}
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/signup" element={<SignupForm />} />
          <Route path="/forgot-password" element={<ForgotPasswordForm />} />
          <Route path="/reset-password" element={<ResetPasswordForm />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/select-role" element={<RoleSelectionPage />} />
          <Route
            path="/account"
            element={
              <Authenticated>
                <AccountLayout />
              </Authenticated>
            }
          >
            <Route index element={<AccountOverviewPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderId" element={<OrderDetailPage />} />
            <Route path="addresses" element={<AddressesPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="returns" element={<ReturnsPage />} />
            <Route path="refunds" element={<RefundsPage />} />
            <Route path="security" element={<AccountSecurityPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="preferences" element={<PreferencesPage />} />
          </Route>
          {/* Staff sign-in must remain reachable when a customer session is already active,
        so an administrator can switch accounts without the guest guard bouncing away. */}
          <Route path="/admin/login" element={<WorkspaceLoginGate role="ADMIN" />} />
          <Route path="/vendor/login" element={<WorkspaceLoginGate role="VENDOR" />} />
          <Route path="/vendor/application-status" element={<VendorApplicationStatusPage />} />
          <Route path="/admin/*" element={<WorkspaceGate role="ADMIN" />} />
          <Route path="/vendor/*" element={<WorkspaceGate role="VENDOR" />} />
          <Route path="/marketplace/*" element={<LegacyWorkspaceRedirect />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function LegacyWorkspaceRedirect() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading)
    return (
      <div className="auth-loading" role="status">
        Checking session…
      </div>
    );
  if (!auth.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Navigate to={roleDestination(auth.data.role, auth.data.vendorStatus)} replace />;
}

function NotFoundPage() {
  return (
    <>
      <main className="not-found-page">
        <span className="eyebrow">404 · PAGE NOT FOUND</span>
        <h1>This page wandered off.</h1>
        <p>The page may have moved, or the address may be mistyped.</p>
        <a className="button button-dark" href="/">
          Back to the shop
        </a>
      </main>
    </>
  );
}

function CategoryListingRoute() {
  const { category = '' } = useParams();
  return <Navigate to={`/products?category=${encodeURIComponent(category)}`} replace />;
}
