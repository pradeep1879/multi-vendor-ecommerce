import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, setStorefrontAccessToken } from '../../api/client';
import { Button } from '../../components/ui/button';
import { PasswordField } from './PasswordField';
import { PasswordStrength } from './PasswordStrength';
import { isStrongPassword } from './password-policy';
import { errorMessage } from './auth-error';
import { AuthError } from './AuthFields';

export function AccountSecurityPage() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!isStrongPassword(password)) return setError('Please meet all password requirements.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/password/change', { currentPassword: current, newPassword: password });
      setCurrent('');
      setPassword('');
      setConfirm('');
      setMessage('Password updated. Sign in again to continue.');
      await api.post('/auth/logout');
      setStorefrontAccessToken('');
      queryClient.clear();
      navigate('/login');
    } catch (reason) {
      setError(errorMessage(reason, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function signOutAll() {
    await api.post('/auth/logout-all');
    setStorefrontAccessToken('');
    queryClient.clear();
    navigate('/login');
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-store-muted">
          Sign-in and safety
        </p>
        <h2 className="mt-2 font-store text-3xl font-normal">Security</h2>
        <p className="mt-2 text-sm text-store-muted">
          Update your password or sign out every active session.
        </p>
      </div>
      <section className="border border-store-line bg-white p-5 sm:p-6">
        <h3 className="mb-4 font-store text-xl">Change password</h3>
        <form onSubmit={submit} className="grid max-w-xl gap-4">
          <PasswordField
            label="Current password"
            name="current-password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            name="new-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <PasswordStrength value={password} />
          <PasswordField
            label="Confirm new password"
            name="confirm-new-password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <AuthError>{error}</AuthError>
          {message && (
            <p role="status" className="text-sm text-[#59634c]">
              {message}
            </p>
          )}
          <Button disabled={busy || !current || !password || !confirm}>
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </section>
      <section className="border border-store-line bg-white p-5 sm:p-6">
        <h3 className="font-store text-xl">Active sessions</h3>
        <p className="mt-1 text-sm text-store-muted">
          End every signed-in session, including this device.
        </p>
        <Button size="sm" variant="outline" className="mt-4" onClick={() => void signOutAll()}>
          Sign out all sessions
        </Button>
      </section>
    </div>
  );
}
