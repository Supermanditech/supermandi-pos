import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// A3: Console-visible log on app start for debugging "no screens" issues
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || window.location.origin) + '/api/v1/retailer-admin';
const AUTH_MODE = 'Bearer Token (localStorage)';
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

console.log('%c[Retailer Dashboard] Bootstrap Info', 'color: #22c55e; font-weight: bold');
console.log('  API_BASE_URL=' + API_BASE_URL);
console.log('  AUTH_MODE=' + AUTH_MODE);
console.log('  DEMO_MODE=' + DEMO_MODE);
console.log('  ROUTER_BASE=/s/:storeCode');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
