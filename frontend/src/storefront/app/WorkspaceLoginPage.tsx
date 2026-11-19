import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { api, setStorefrontAccessToken } from '../api/client';
import { useAuth, authQueryKey, type AuthUser } from '../features/auth/auth-state';
import { PasswordField } from '../features/auth/PasswordField';
import { errorMessage } from '../features/auth/auth-error';
import { showToast } from '../../components/feedback/toast';
import { canAccessWorkspace, roleDestination, type WorkspaceRole } from './workspace-access';
import './workspace-login.css';

export function WorkspaceLoginGate({ role }: { role: WorkspaceRole }) {
  const auth = useAuth();
  if (auth.isLoading) return <div className="workspace-login-loading">Loading secure sign-in…</div>;
  if (auth.data?.roles.length && auth.data.roles.length > 1)
    return <Navigate to="/select-role" replace />;
  if (auth.data && canAccessWorkspace(role, auth.data.roles))
    return <Navigate to={roleDestination(role, auth.data.vendorStatus)} replace />;
  return <WorkspaceLoginPage role={role} />;
}

function WorkspaceLoginPage({ role }: { role: WorkspaceRole }) {
  const admin = role === 'ADMIN';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (error) showToast(error, 'error');
  }, [error]);
  const signIn = useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        data: { user: AuthUser & { roles?: string[] }; accessToken: string };
      }>('/auth/login', { email, password });
      const { user, accessToken } = response.data.data;
      const roles = user.roles ?? [user.role];
      const signedInUser: AuthUser = {
        ...user,
        roles: roles as AuthUser['roles'],
        role: roles.includes('ADMIN') ? 'ADMIN' : roles.includes('VENDOR') ? 'VENDOR' : 'CUSTOMER',
      };
      if (!canAccessWorkspace(role, signedInUser.roles)) {
        await api.post('/auth/logout').catch(() => undefined);
        throw new Error(
          admin
            ? 'This account does not have administrator access.'
            : 'This account does not have vendor access.',
        );
      }
      return { signedInUser, accessToken };
    },
    onSuccess: ({ signedInUser, accessToken }) => {
      setStorefrontAccessToken(accessToken);
      queryClient.setQueryData(authQueryKey, signedInUser);
      navigate(
        signedInUser.roles.length > 1
          ? '/select-role'
          : roleDestination(role, signedInUser.vendorStatus),
        { replace: true },
      );
    },
    onError: (reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : errorMessage(reason, 'Email or password is incorrect.'),
      ),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    signIn.mutate();
  };

  return (
    <main
      className={`workspace-login ${admin ? 'workspace-login-admin' : 'workspace-login-vendor'}`}
    >
      <header className="workspace-login-header">
        <Link to="/" className="workspace-login-brand">
          <span className="workspace-login-mark">A</span>
          <span>
            <b>Aster Market</b>
            <small>Commerce workspace</small>
          </span>
        </Link>
        <Link to="/" className="workspace-login-store">
          Return to storefront <ArrowRight size={15} />
        </Link>
      </header>
      <section className="workspace-login-layout">
        <div className="workspace-login-intro">
          <span className="workspace-login-eyebrow">
            {admin ? 'Administrator access' : 'Vendor access'}
          </span>
          <h1>
            {admin ? (
              <>
                A clearer view
                <br />
                of the whole
                <br />
                <em>marketplace.</em>
              </>
            ) : (
              <>
                Your store,
                <br />
                thoughtfully
                <br />
                <em>in your hands.</em>
              </>
            )}
          </h1>
          <p>
            {admin
              ? 'Review marketplace activity and keep every part of Aster Market running smoothly.'
              : 'Keep your catalog, orders, stock and store details in one calm workspace.'}
          </p>
          <div className="workspace-login-perks">
            {(admin
              ? [
                  ['Live overview', 'Orders and marketplace performance'],
                  ['Operations', 'Vendors, returns and catalog review'],
                ]
              : [
                  ['Store operations', 'Products, stock and fulfillment'],
                  ['Your earnings', 'Payouts and settlement history'],
                ]
            ).map(([title, text], index) => (
              <div className="workspace-login-perk" key={title}>
                <span>
                  {admin ? (
                    index === 0 ? (
                      <BarChart3 />
                    ) : (
                      <ShieldCheck />
                    )
                  ) : index === 0 ? (
                    <Boxes />
                  ) : (
                    <CheckCircle2 />
                  )}
                </span>
                <div>
                  <b>{title}</b>
                  <small>{text}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <section className="workspace-login-card" aria-labelledby="workspace-login-title">
          <div className="workspace-login-card-icon">
            {admin ? <ShieldCheck size={20} /> : <Store size={20} />}
          </div>
          <div className="workspace-login-card-kicker">
            {admin ? 'Admin console' : 'Vendor studio'}
          </div>
          <h2 id="workspace-login-title">Sign in to continue</h2>
          <p className="workspace-login-card-copy">
            {admin
              ? 'Use your administrator account.'
              : 'Use the approved account associated with your store.'}
          </p>
          <form onSubmit={submit} noValidate>
            <label className="workspace-login-field">
              Email address
              <input
                type="email"
                name="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <PasswordField
              label="Password"
              name={`${role.toLowerCase()}-password`}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
            <div className="workspace-login-hint">
              <LockKeyhole size={14} />
              <span>Your session uses the workspace’s secure sign-in cookie.</span>
            </div>
            <button
              className="workspace-login-submit"
              disabled={signIn.isPending || !email.trim() || !password}
              type="submit"
            >
              {signIn.isPending ? (
                <>
                  <span className="workspace-login-spinner" /> Signing in securely…
                </>
              ) : (
                <>
                  Sign in to {admin ? 'admin' : 'your store'} <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
          <div className="workspace-login-footnote">
            Access is limited to accounts with the {admin ? 'admin' : 'vendor'} role.
          </div>
        </section>
      </section>
      <footer className="workspace-login-footer">
        <span>© {new Date().getFullYear()} Aster Market</span>
        <span>Secure role-based access</span>
      </footer>
    </main>
  );
}
