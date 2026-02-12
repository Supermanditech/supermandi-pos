import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'

// AUDIT-SA-049: Catch async errors that ErrorBoundary cannot (unhandled rejections, global errors)
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global] Unhandled promise rejection:', event.reason);
});
window.addEventListener('error', (event) => {
  console.error('[Global] Uncaught error:', event.error || event.message);
});

// GO-LIVE-172: Wrap app in error boundary to catch React rendering errors
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
