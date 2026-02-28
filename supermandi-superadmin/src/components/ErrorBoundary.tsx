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
        <div className="sa-error-boundary">
          <h2 className="sa-error-title">Something went wrong</h2>
          <p className="sa-error-msg">
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <div className="sa-error-actions">
            {/* R6.SA.021: Try Again resets error state before full page reload */}
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="sa-btn-retry"
            >
              Try Again
            </button>
            <button
              onClick={() => { window.location.href = '/admin/'; }}
              className="sa-btn-home"
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
