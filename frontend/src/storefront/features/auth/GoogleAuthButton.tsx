import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, setStorefrontAccessToken } from '../../api/client';
import { authQueryKey, normalizeAuthUser, type AuthUserResponse } from './auth-state';
import { errorMessage } from './auth-error';
import { showToast } from '../../../components/feedback/toast';
import { authenticatedLanding, safeCustomerReturnPath } from '../../app/workspace-access';

export function GoogleAuthButton() {
  const processing = useRef(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (message) showToast(message, 'error');
  }, [message]);
  const [initializing, setInitializing] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const adminOnly = location.pathname.startsWith('/admin');
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) {
      setInitializing(false);
      setMessage('Google sign in is not configured.');
      return;
    }
    let cancelled = false;
    let initialized = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        setInitializing(false);
        setMessage('Google sign in is taking too long. Reload the page and try again.');
      }
    }, 15000);
    const mount = async () => {
      if (cancelled || initialized || !window.google) return;
      initialized = true;
      try {
        if (cancelled) return;
        window.google!.accounts.id.initialize({
          client_id: clientId,
          context: 'signin',
          auto_select: false,
          callback: async ({ credential }) => {
            if (cancelled || processing.current) return;
            processing.current = true;
            setSigningIn(true);
            setMessage('');
            try {
              await queryClient.cancelQueries({ queryKey: authQueryKey });
              const response = await api.post<{
                data: { user: AuthUserResponse; accessToken: string };
              }>('/auth/google', { credential }, { timeout: 15_000 });
              if (cancelled) return;
              setStorefrontAccessToken(response.data.data.accessToken);
              const user = response.data.data.user;
              const signedInUser = normalizeAuthUser(user);
              queryClient.setQueryData(authQueryKey, signedInUser);
              const requestedPath = (location.state as { from?: string } | null)?.from;
              const intended = safeCustomerReturnPath(
                requestedPath ?? new URLSearchParams(location.search).get('next'),
              );
              const destination = authenticatedLanding(signedInUser, intended);
              navigate(destination, {
                replace: true,
                state: destination === '/select-role' && intended ? { from: intended } : undefined,
              });
            } catch (error) {
              if (!cancelled)
                setMessage(
                  errorMessage(error, 'Google sign in could not be completed. Please try again.'),
                );
            } finally {
              processing.current = false;
              if (!cancelled) setSigningIn(false);
            }
          },
        });
        window.clearTimeout(timeout);
        setInitializing(false);
      } catch (error) {
        if (!cancelled) {
          window.clearTimeout(timeout);
          setInitializing(false);
          setMessage(
            errorMessage(error, 'Google sign in could not be initialized. Please try again.'),
          );
        }
      }
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', mount);
      if (window.google) void mount();
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
        existing.removeEventListener('load', mount);
      };
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.addEventListener('load', mount);
    script.addEventListener(
      'error',
      () => {
        if (!cancelled) {
          window.clearTimeout(timeout);
          setInitializing(false);
          setMessage('Could not load Google sign in. Please try again.');
        }
      },
      { once: true },
    );
    document.head.append(script);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      script.removeEventListener('load', mount);
    };
  }, [adminOnly, navigate, queryClient]);
  const startGoogleSignIn = () => {
    const googleIdentity = window.google?.accounts.id;
    if (!googleIdentity || initializing || signingIn) return;
    setMessage('');
    googleIdentity.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        setMessage(
          'Google sign-in could not open. Check your browser privacy settings and try again.',
        );
      }
    });
  };
  return (
    <div className="google-auth-wrap" aria-busy={initializing || signingIn}>
      <div className="google-auth-frame relative">
        <button
          type="button"
          className="google-auth-button"
          onClick={startGoogleSignIn}
          disabled={initializing || signingIn}
        >
          {signingIn ? (
            <span className="google-auth-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.3 5.66c4.27-3.94 7.47-9.77 7.47-17.31Z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.2a23.95 23.95 0 0 0 0 21.58l7.98-6.2Z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.47 0 11.9-2.13 15.87-5.8l-7.3-5.66c-2.03 1.36-4.64 2.16-8.57 2.16-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.2C6.51 42.62 14.62 48 24 48Z"
              />
            </svg>
          )}
          <span>
            {initializing
              ? 'Loading Google sign-in…'
              : signingIn
                ? 'Signing in…'
                : 'Sign in with Google'}
          </span>
        </button>
      </div>
    </div>
  );
}
