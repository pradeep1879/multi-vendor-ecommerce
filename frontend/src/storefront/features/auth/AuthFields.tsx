import { useEffect } from 'react';
import { Input } from '../../components/ui/input';
import { showToast } from '../../../components/feedback/toast';

export function EmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="auth-field">
      Email address
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="email"
        autoComplete="email"
        required
        maxLength={254}
      />
    </label>
  );
}

export function AuthError({ children }: { children: string }) {
  useEffect(() => {
    if (children) showToast(children, 'error');
  }, [children]);
  return null;
}

export function SocialDivider() {
  return (
    <div className="auth-divider">
      <span>or</span>
    </div>
  );
}
