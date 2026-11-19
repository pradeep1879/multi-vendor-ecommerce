import { useState } from 'react';

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  minLength?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  maxLength?: number;
  autoComplete?: string;
  helperText?: string;
};

export function Field({
  label,
  name,
  type = 'text',
  required = true,
  defaultValue = '',
  minLength,
  min,
  max,
  step,
  maxLength,
  autoComplete,
  helperText,
}: FieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = `field-${name}`;
  const helperId = helperText ? `${inputId}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {type === 'password' ? (
        <span className="password-input-wrap">
          <input
            id={inputId}
            name={name}
            type={visible ? 'text' : 'password'}
            required={required}
            minLength={minLength}
            min={min}
            max={max}
            step={step}
            maxLength={maxLength}
            autoComplete={autoComplete}
            defaultValue={defaultValue}
            aria-describedby={helperId}
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            aria-controls={inputId}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? <EyeIcon crossed /> : <EyeIcon />}
          </button>
        </span>
      ) : (
        <input
          id={inputId}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          minLength={minLength}
          min={min}
          max={max}
          step={step}
          maxLength={maxLength}
          aria-describedby={helperId}
        />
      )}
      {helperText && (
        <small id={helperId} className="field-hint">
          {helperText}
        </small>
      )}
    </div>
  );
}

function EyeIcon({ crossed = false }: { crossed?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {crossed ? (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.7 4.2 9.5 7-.3.7-1.1 1.8-2.3 2.9M6.2 6.2C3.9 7.6 2.8 9.7 2.5 11c.8 1.8 4.3 6 9.5 6 1.2 0 2.3-.2 3.3-.7" />
        </>
      ) : (
        <>
          <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      )}
    </svg>
  );
}
