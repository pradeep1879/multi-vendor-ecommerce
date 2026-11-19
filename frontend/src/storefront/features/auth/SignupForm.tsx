import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api, setStorefrontAccessToken } from '../../api/client';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { AuthLayout } from './AuthLayout';
import { GoogleAuthButton } from './GoogleAuthButton';
import { PasswordField } from './PasswordField';
import { isStrongPassword } from './password-policy';
import { errorMessage } from './auth-error';
import { EmailField, AuthError, SocialDivider } from './AuthFields';
import { authQueryKey, normalizeAuthUser } from './auth-state';

export function SignupForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!isStrongPassword(password)) return setError('Please meet all password requirements.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const result = await api.post<{
        data: {
          user: {
            id: string;
            name: string;
            email: string;
            roles: ('CUSTOMER' | 'VENDOR' | 'ADMIN')[];
            vendorStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
          };
          accessToken: string;
        };
      }>('/auth/signup', {
        name,
        email,
        password,
        confirmPassword: confirm,
      });
      setStorefrontAccessToken(result.data.data.accessToken);
      const user = result.data.data.user;
      const signedInUser = normalizeAuthUser(user);
      queryClient.setQueryData(authQueryKey, signedInUser);
      navigate(signedInUser.roles.length > 1 ? '/select-role' : '/', { replace: true });
    } catch (reason) {
      setError(errorMessage(reason, 'We couldn’t create your account. Please try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout
      className="store-auth-signup"
      title={
        <>
          Create <em>account.</em>
        </>
      }
      description="A little place for your favourite rituals."
    >
      <p className="signup-eyebrow">Aster Market <span>·</span> Your account</p>
      <form onSubmit={submit} className="auth-form signup-form">
        <div className="signup-name">
          <label className="auth-field">
            Full name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
            />
          </label>
        </div>
        <div className="signup-email">
          <EmailField value={email} onChange={setEmail} />
        </div>
        <div className="signup-password">
          <PasswordField
            label="Password"
            name="signup-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
        </div>
        <div className="signup-confirm">
          <PasswordField
            label="Confirm password"
            name="signup-confirm-password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
        </div>
        <div className="signup-submit">
          {message && (
            <div className="auth-success" role="status">
              {message}
            </div>
          )}
          <AuthError>{error}</AuthError>
          <Button className="button button-dark" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'} <ArrowRight size={15} />
          </Button>
        </div>
      </form>
      <div className="signup-social">
        <SocialDivider />
        <GoogleAuthButton />
        <div className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
