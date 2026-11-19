import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

type Props = {
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  onGoogleCredential: (idToken: string) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            context?: string;
            auto_select?: boolean;
          }) => void;
          prompt: (listener?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
          }) => void) => void;
          renderButton: (
            element: HTMLElement,
            options: { theme: string; size: string; width: number; type?: string; text?: string },
          ) => void;
        };
      };
    };
  }
}

export function AuthForm({ mode, onModeChange, onSubmit, busy, onGoogleCredential }: Props) {
  const googleButton = useRef<HTMLDivElement>(null);
  const credentialHandler = useRef(onGoogleCredential);
  const [googleClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '');
  credentialHandler.current = onGoogleCredential;

  useEffect(() => {
    if (!googleClientId || !googleButton.current) return;
    const setup = () => {
      if (!window.google || !googleButton.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: ({ credential }) => {
          if (credential) credentialHandler.current(credential);
        },
      });
      window.google.accounts.id.renderButton(googleButton.current, {
        type: 'standard',
        text: 'signin_with',
        theme: 'outline',
        size: 'large',
        width: 320,
      });
    };
    if (window.google) {
      setup();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = setup;
    document.head.append(script);
    return () => script.remove();
  }, [googleClientId]);

  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <label className="field" htmlFor="auth-mode">
        <span>Account action</span>
        <select
          id="auth-mode"
          name="mode"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as 'login' | 'register')}
        >
          <option value="login">Sign in</option>
          <option value="register">Create account</option>
        </select>
      </label>
      {mode === 'register' && <Field label="Full name" name="name" autoComplete="name" />}
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        minLength={mode === 'register' ? 12 : undefined}
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        helperText={mode === 'register' ? 'Use at least 12 characters.' : undefined}
      />
      <Button variant="primary" disabled={busy}>
        {busy ? 'Please wait…' : 'Continue'}
      </Button>
      {googleClientId && (
        <div className="google-sign-in">
          <span aria-hidden="true">or</span>
          <div ref={googleButton} aria-label="Sign in with Google" />
        </div>
      )}
    </form>
  );
}
