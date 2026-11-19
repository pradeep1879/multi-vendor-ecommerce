import { Component, type ErrorInfo, type ReactNode } from 'react';

type State = { hasError: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Marketplace interface error', error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary">
          <h1>This page could not be displayed</h1>
          <p>Reload the page to try again. Your account data is still protected by the server.</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
