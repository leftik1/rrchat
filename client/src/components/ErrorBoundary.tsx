import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            backgroundColor: 'var(--surface-3, #110b0b)',
            color: 'var(--text, #e2e1e1)',
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <AlertTriangle size={32} color="var(--danger, #c25a5a)" />
          <div style={{ fontSize: '15px', fontWeight: 'bold' }}>
            {this.props.fallbackTitle || 'Error loading view'}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted, #888686)',
              maxWidth: '400px',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error?.message || 'Unknown render error'}
          </div>
          <button
            type="button"
            className="press"
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--surface-1, #120e0e)',
              color: 'var(--text, #e2e1e1)',
              border: '1px solid var(--border-dim, rgba(255,255,255,0.08))',
              padding: '10px 18px',
              borderRadius: 'var(--r-m, 14px)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} />
            <span>Retry</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
