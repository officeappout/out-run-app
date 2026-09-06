'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ErrorBoundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 * 
 * Usage:
 * <ErrorBoundary fallback={<CustomFallback />}>
 *   <YourComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    
    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      // Whether a fallback was REQUESTED (the prop was passed at all) is a
      // different question from whether its value is truthy. `fallback={null}`
      // is a deliberate "render nothing" request from the caller — a
      // truthiness check treats it identically to the caller never passing
      // `fallback` at all, silently falling through to the default red
      // screen. Checking `'fallback' in this.props` distinguishes the two.
      // `?? null` covers the (currently unused) edge case of an explicit
      // `fallback={undefined}`, so this never returns `undefined` from
      // render (React throws on that) — it renders nothing instead, which
      // is the closer intent anyway.
      if ('fallback' in this.props) {
        return this.props.fallback ?? null;
      }

      // Default fallback UI
      return (
        <div className="flex items-center justify-center min-h-[300px] p-6">
          <div className="max-w-md w-full bg-red-50 border-2 border-red-200 rounded-xl p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-red-900">
                שגיאה בטעינת הרכיב
              </h2>
            </div>
            
            <p className="text-sm text-red-700 mb-4">
              אירעה שגיאה בלתי צפויה. הנתונים שלך נשמרו באופן אוטומטי.
            </p>

            {this.state.error && (
              <details className="mb-4">
                <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800 font-semibold">
                  פרטים טכניים
                </summary>
                <div className="mt-2 p-3 bg-white rounded-lg border border-red-200">
                  <p className="text-xs font-mono text-gray-700 break-all">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <pre className="text-[10px] font-mono text-gray-600 mt-2 overflow-auto max-h-32">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              <RefreshCw size={16} />
              נסה שוב
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
