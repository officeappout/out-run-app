'use client';

import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { reportBoundaryError } from './report-boundary-error';

export interface WidgetBoundaryProps {
  /** Stable id for Sentry (`boundary` tag), e.g. "home.StepsSummaryCard". */
  name: string;
  children: ReactNode;
  /**
   * Rendered instead of the widget after it throws. Default: nothing.
   * A function receives `retry`, which clears the error and re-mounts the
   * widget (for a compact "נסו שוב" card).
   */
  fallback?: WidgetFallback;
  /**
   * When any value here changes after a failure, the boundary clears its
   * error and tries the widget again (e.g. pass `[isOpen]` for an overlay so
   * the next open is a fresh attempt).
   */
  resetKeys?: readonly unknown[];
}

export type WidgetFallback = ReactNode | ((retry: () => void) => ReactNode);

interface State {
  failed: boolean;
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
}

/**
 * WidgetBoundary — contains a crash to ONE independent widget (a home card,
 * a community board, a lazy overlay) so the rest of the screen, the bottom
 * nav and any live session keep working. The failure is reported to Sentry.
 *
 * Use for widgets the screen can live without. For a whole route use that
 * segment's `error.tsx` (RouteErrorFallback) instead.
 */
export default class WidgetBoundary extends Component<WidgetBoundaryProps, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportBoundaryError(error, this.props.name, info.componentStack);
  }

  componentDidUpdate(prev: WidgetBoundaryProps) {
    if (this.state.failed && keysChanged(prev.resetKeys, this.props.resetKeys)) {
      this.setState({ failed: false });
    }
  }

  retry = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) {
      const { fallback } = this.props;
      return (typeof fallback === 'function' ? fallback(this.retry) : fallback) ?? null;
    }
    return this.props.children;
  }
}

/**
 * Wraps a component in a WidgetBoundary once, at module level, so the call
 * sites (and their props) stay exactly as they were.
 */
export function withWidgetBoundary<P extends object>(
  Widget: ComponentType<P>,
  name: string,
  fallback: WidgetFallback = null,
): ComponentType<P> {
  function Bounded(props: P) {
    return (
      <WidgetBoundary name={name} fallback={fallback}>
        <Widget {...props} />
      </WidgetBoundary>
    );
  }
  Bounded.displayName = `WidgetBoundary(${name})`;
  return Bounded;
}
