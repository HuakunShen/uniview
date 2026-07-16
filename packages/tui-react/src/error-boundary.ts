import { Component, createElement, type ErrorInfo, type ReactElement, type ReactNode } from "react";

/** Props for {@link ErrorOverview}. */
export interface ErrorOverviewProps {
  error: unknown;
  title?: string;
}

/**
 * A readable error panel drawn from `box`/`text` primitives — shown in place of
 * a broken subtree so the terminal renders a full frame instead of a wrecked
 * one. Message only (no stack) so it is deterministic across bindings and safe
 * to assert byte-identical against the Solid overlay.
 */
export function ErrorOverview({ error, title = "Plugin error" }: ErrorOverviewProps): ReactElement {
  const message = error instanceof Error ? error.message : String(error);
  return createElement(
    "box",
    { flexDirection: "column", border: "rounded", padding: 1, role: "alert" },
    createElement("text", { color: "red", bold: true }, title),
    createElement("text", null, message),
  );
}

/** Props for {@link ErrorBoundary}. */
export interface ErrorBoundaryProps {
  fallback: (error: unknown, reset: () => void) => ReactNode;
  children?: ReactNode;
  onError?: (error: unknown, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

/** Catches render errors in its subtree and shows `fallback(error, reset)`. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
