import { passwordChecks as checks } from './password-policy';
export function PasswordStrength({ value }: { value: string }) {
  if (!value)
    return (
      <div className="password-strength">
        <span>Password strength and requirements</span>
        <ul>
          {checks.map(([label]) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
    );
  const score = checks.filter(([, check]) => check(value)).length;
  const strength = score <= 2 ? 'Weak' : score <= 3 ? 'Fair' : score === 4 ? 'Good' : 'Strong';
  return (
    <div className="password-strength" aria-live="polite">
      <div className="strength-title">
        Password strength: <strong>{strength}</strong>
      </div>
      <div className="strength-meter" aria-label={`${strength} password`}>
        <i style={{ width: `${score * 20}%` }} />
      </div>
      <ul>
        {checks.map(([label, check]) => (
          <li className={check(value) ? 'met' : ''} key={label}>
            <span aria-hidden="true">{check(value) ? '✓' : '○'}</span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
