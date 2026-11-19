import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Button } from '../../components/ui/button';
import { AuthLayout } from './AuthLayout';
import { errorMessage } from './auth-error';
import { EmailField, AuthError } from './AuthFields';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', {
        email,
      });
      setMessage('If an account exists for this email, reset instructions have been sent.');
    } catch (reason) {
      setError(errorMessage(reason, 'Please try again later.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout
      title={
        <>
          Forgot your <em>password?</em>
        </>
      }
      description="Enter your email and we’ll send reset instructions if an active account exists."
    >
      <form onSubmit={submit} className="auth-form">
        <EmailField value={email} onChange={setEmail} />
        {message && (
          <div className="auth-success" role="status">
            {message}
          </div>
        )}
        <AuthError>{error}</AuthError>
        <Button className="button button-dark" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset instructions'}
        </Button>
      </form>
      <div className="auth-switch">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthLayout>
  );
}
