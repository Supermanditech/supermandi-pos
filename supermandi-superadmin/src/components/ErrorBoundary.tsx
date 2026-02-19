import React from 'react';

// ISSUE-MICRO-105: Global error boundary for superadmin

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h2 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ color: '#64748b', marginBottom: '1rem', maxWidth: '400px' }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Refresh Page
            </button>
            <button
              onClick={() => { window.location.href = '/admin/'; }}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#64748b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
