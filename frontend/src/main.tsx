import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import StorefrontApp from './storefront/app/App';
import { setStorefrontAccessToken } from './storefront/api/client';
import { ToastViewport } from './components/feedback/ToastViewport';
import { getErrorMessage, showToast } from './components/feedback/toast';
import './components/feedback/toast.css';
import './storefront/styles.css';
import './storefront/bag.css';
import './storefront/styles/customer-tokens.css';
import './storefront/styles/customer-base.css';
import './storefront/styles/customer-overlay.css';
import './storefront/styles/customer-layout.css';
import './storefront/styles/customer-home.css';
import './storefront/styles/customer-products.css';
import './storefront/styles/customer-commerce.css';
import './storefront/styles/customer-account.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) =>
      showToast(
        getErrorMessage(
          error,
          'We couldn’t load that information. Check your connection and try again.',
        ),
        'error',
      ),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _result, mutation) => {
      if (!mutation.options.onError)
        showToast(
          getErrorMessage(error, 'That action couldn’t be completed. Please try again.'),
          'error',
        );
    },
  }),
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

window.addEventListener('auth:expired', () => {
  queryClient.clear();
  setStorefrontAccessToken('');
  if (location.pathname.startsWith('/admin')) location.assign('/admin/login');
  else if (location.pathname.startsWith('/vendor')) location.assign('/vendor/login');
  else if (location.pathname.startsWith('/account') || location.pathname.startsWith('/marketplace'))
    location.assign('/login');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<StorefrontApp />} />
        </Routes>
        <ToastViewport />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
