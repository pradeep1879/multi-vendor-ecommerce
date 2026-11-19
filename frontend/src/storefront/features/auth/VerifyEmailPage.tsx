import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Button } from '../../components/ui/button';
import { AuthLayout } from './AuthLayout';
import { errorMessage } from './auth-error';
import { AuthError } from './AuthFields';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function verify() {
    setBusy(true);
    try {
      await api.post('/auth/verify-email', { token });
      setMessage('Your email is verified. You can sign in now.');
    } catch (reason) {
      setError(errorMessage(reason, 'This verification link is invalid or expired.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout
      title={
        <>
          Verify your <em>email.</em>
        </>
      }
      description="Email verification keeps your account safe."
    >
      {token ? (
        <div className="auth-form">
          <AuthError>{error}</AuthError>
          {message && <div className="auth-success">{message}</div>}
          <Button
            className="button button-dark"
            onClick={verify}
            disabled={busy || Boolean(message)}
          >
            {busy ? 'Verifying…' : 'Verify email'}
          </Button>
        </div>
      ) : (
        <div className="auth-form">
          <p>Sign in to your account, then resend the verification link from your profile.</p>
          <AuthError>{error}</AuthError>
          {message && <div className="auth-success">{message}</div>}
          <Link className="button button-dark" to="/login">
            Go to sign in
          </Link>
        </div>
      )}
      <div className="auth-switch">
        <Link to="/login">Go to sign in</Link>
      </div>
    </AuthLayout>
  );
}
