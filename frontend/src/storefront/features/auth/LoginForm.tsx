import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowRight } from 'lucide-react';
import { api, setStorefrontAccessToken } from '../../api/client';
import { Button } from '../../components/ui/button';
import { AuthLayout } from './AuthLayout';
import { GoogleAuthButton } from './GoogleAuthButton';
import { PasswordField } from './PasswordField';
import {
  authQueryKey,
  normalizeAuthUser,
  type AuthUser,
  type AuthUserResponse,
} from './auth-state';
import { errorMessage } from './auth-error';
import { EmailField, AuthError, SocialDivider } from './AuthFields';
import { authenticatedLanding, safeCustomerReturnPath } from '../../app/workspace-access';

export function LoginForm({ currentUser }: { currentUser?: AuthUser }) {
  const [email, setEmail] = useState(
    import.meta.env.DEV && !currentUser ? 'customer@example.sample' : '',
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV && !currentUser ? 'Customer@12345' : '',
  );
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const staffReturnPath =
    (routeLocation.state as { from?: string } | null)?.from ?? params.get('next') ?? '';
  const admin = routeLocation.pathname.startsWith('/admin') || staffReturnPath.startsWith('/admin');
  const vendorSignIn = staffReturnPath.startsWith('/vendor');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNeedsVerification(false);
    try {
      await queryClient.cancelQueries({ queryKey: authQueryKey });
      const response = await api.post<{ data: { user: AuthUserResponse; accessToken: string } }>(
        '/auth/login',
        { email, password },
      );
      const { user, accessToken } = response.data.data;
      setStorefrontAccessToken(accessToken);
      const signedInUser = normalizeAuthUser(user);
      queryClient.setQueryData(authQueryKey, signedInUser);
      const intended = safeCustomerReturnPath(
        (routeLocation.state as { from?: string } | null)?.from ?? params.get('next'),
      );
      const destination = authenticatedLanding(signedInUser, intended);
      navigate(destination, {
        replace: true,
        state: destination === '/select-role' && intended ? { from: intended } : undefined,
      });
    } catch (reason) {
      setError(errorMessage(reason, 'We couldn’t sign you in. Check your details and try again.'));
      setNeedsVerification(
        axios.isAxiosError<{ error?: { code?: string } }>(reason) &&
          reason.response?.data.error?.code === 'AUTH_EMAIL_UNVERIFIED',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout
      className="store-auth-login"
      title={
        <>
          Welcome <em>back.</em>
        </>
      }
      eyebrow={admin ? 'Staff sign in' : vendorSignIn ? 'Vendor sign in' : undefined}
      description={
        admin
          ? 'Use your administrator account to continue.'
          : vendorSignIn
            ? 'Use your approved vendor account to manage your store.'
            : 'Sign in to see your orders and saved items.'
      }
    >
      {!admin && (
        <p className="login-eyebrow">
          Aster Market <span>·</span> Your account
        </p>
      )}
      {admin && currentUser?.role === 'CUSTOMER' && (
        <div className="auth-hint" role="status">
          Signed in as {currentUser.email}. Enter an administrator account to switch.
        </div>
      )}
      <form onSubmit={submit} className="auth-form">
        <EmailField value={email} onChange={setEmail} />
        <PasswordField
          label="Password"
          name="login-password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <div className="auth-links auth-forgot">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <AuthError>{error}</AuthError>
        {needsVerification && (
          <div className="auth-hint">
            <Link to={`/verify-email?email=${encodeURIComponent(email)}`}>
              Resend verification email
            </Link>
          </div>
        )}
        <Button className="button button-dark" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={15} />
        </Button>
      </form>
      <SocialDivider />
      <GoogleAuthButton />
      {admin && (
        <p className="auth-hint">
          If this account uses Google sign in, continue with Google below.
        </p>
      )}
      {!admin && (
        <div className="auth-switch">
          Don’t have an account?{' '}
          <Link
            to="/signup"
            state={{
              from: safeCustomerReturnPath(
                (routeLocation.state as { from?: string } | null)?.from ?? params.get('next'),
              ),
            }}
          >
            Create new account
          </Link>
        </div>
      )}
      {admin && (
        <div className="auth-switch">
          <Link to="/login">Customer sign in</Link>
        </div>
      )}
    </AuthLayout>
  );
}
