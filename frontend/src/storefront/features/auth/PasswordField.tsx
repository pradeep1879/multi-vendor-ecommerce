import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../../components/ui/input';

type Props = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
};
export function PasswordField({ label, name, value, onChange, autoComplete, error }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      {label}
      <span className="password-control">
        <Input
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          required
          maxLength={128}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      {error && <small className="auth-error">{error}</small>}
    </label>
  );
}
