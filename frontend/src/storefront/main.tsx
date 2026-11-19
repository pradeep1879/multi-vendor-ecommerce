import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import './styles.css';
import './bag.css';
import './styles/customer-tokens.css';
import './styles/customer-base.css';
import './styles/customer-overlay.css';
import './styles/customer-layout.css';
import './styles/customer-home.css';
import './styles/customer-products.css';
import './styles/customer-commerce.css';
import './styles/customer-account.css';
import { authQueryKey } from './features/auth/auth-state';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});
window.addEventListener('auth:expired', () => {
  queryClient.removeQueries({ queryKey: authQueryKey });
  if (location.pathname.startsWith('/admin')) location.assign('/admin/login');
  else if (location.pathname.startsWith('/account')) location.assign('/login');
});

// Keep local cookies, origin checks, and Google's registered JavaScript origin aligned.
const localOrigin = import.meta.env.VITE_LOCAL_ORIGIN || 'http://localhost:5173';
if (
  import.meta.env.DEV &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
  window.location.origin !== localOrigin
) {
  window.location.replace(
    `${localOrigin}${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
