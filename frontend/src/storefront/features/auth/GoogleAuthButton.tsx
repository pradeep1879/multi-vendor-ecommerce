import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, setStorefrontAccessToken } from '../../api/client';
import { authQueryKey, normalizeAuthUser, type AuthUserResponse } from './auth-state';
import { errorMessage } from './auth-error';
import { showToast } from '../../../components/feedback/toast';

export function GoogleAuthButton() {
  const element = useRef<HTMLDivElement>(null);
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
      if (cancelled || initialized || !window.google || !element.current) return;
      initialized = true;
      try {
        if (cancelled || !element.current) return;
        window.google!.accounts.id.initialize({
          client_id: clientId,
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
              navigate(
                signedInUser.roles.length > 1
                  ? '/select-role'
                  : signedInUser.role === 'ADMIN'
                    ? '/admin/dashboard'
                    : signedInUser.role === 'VENDOR'
                      ? signedInUser.vendorStatus === 'APPROVED'
                        ? '/vendor/dashboard'
                        : '/vendor/application-status'
                      : '/',
                { replace: true },
              );
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
        element.current.replaceChildren();
        window.google!.accounts.id.renderButton(element.current, {
          type: 'standard',
          text: 'signin_with',
          theme: 'outline',
          size: 'large',
          width: Math.min(396, element.current.clientWidth || 396),
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
  return (
    <div className="google-auth-wrap" aria-busy={initializing || signingIn}>
      <div className="google-auth-frame relative">
        <div ref={element} className="google-auth-button" />
        {(initializing || signingIn) && (
          <div
            className="absolute inset-0 flex items-center justify-center gap-2 bg-white text-sm text-[#515c43]"
            role="status"
          >
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-[#515c43] border-t-transparent"
              aria-hidden="true"
            />
            {signingIn ? 'Signing in with Google…' : 'Loading Google sign in…'}
          </div>
        )}
      </div>
    </div>
  );
}
