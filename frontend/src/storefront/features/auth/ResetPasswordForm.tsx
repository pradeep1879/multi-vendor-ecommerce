import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Button } from '../../components/ui/button';
import { AuthLayout } from './AuthLayout';
import { PasswordField } from './PasswordField';
import { PasswordStrength } from './PasswordStrength';
import { isStrongPassword } from './password-policy';
import { errorMessage } from './auth-error';
import { AuthError } from './AuthFields';

export function ResetPasswordForm() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!token) return setError('This reset link is incomplete. Request a new one.');
    if (!isStrongPassword(password)) return setError('Please meet all password requirements.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password, confirmPassword: confirm });
      setDone(true);
    } catch (reason) {
      setError(errorMessage(reason, 'This reset link may be expired. Request a new one.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout
      title={
        <>
          Reset your <em>password.</em>
        </>
      }
      description="Choose a strong password you haven’t used before."
    >
      {done ? (
        <div className="auth-success">
          Password reset successfully. <Link to="/login">Sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <PasswordField
            label="New password"
            name="reset-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <PasswordStrength value={password} />
          <PasswordField
            label="Confirm new password"
            name="reset-confirm-password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <AuthError>{error}</AuthError>
          <Button className="button button-dark" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
