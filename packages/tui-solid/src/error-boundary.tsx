import { ErrorBoundary, type JSX } from "solid-js";
import { Box, Text } from "./primitives";

/** Props for {@link ErrorOverview}. */
export interface ErrorOverviewProps {
  error: unknown;
  title?: string;
}

/**
 * A readable error panel drawn from `box`/`text` primitives — the Solid twin of
 * `@uniview/tui-react`'s `ErrorOverview`, deliberately identical output (message
 * only, no stack) so the two render byte-identical SVG.
 */
export function ErrorOverview(props: ErrorOverviewProps): JSX.Element {
  const message = (): string =>
    props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <Box flexDirection="column" border="rounded" padding={1} role="alert">
      <Text color="red" bold>
        {props.title ?? "Plugin error"}
      </Text>
      <Text>{message()}</Text>
    </Box>
  );
}

/** Props for {@link TuiErrorBoundary}. */
export interface TuiErrorBoundaryProps {
  children: JSX.Element;
  fallback?: (error: unknown, reset: () => void) => JSX.Element;
}

/**
 * Wraps Solid's own `<ErrorBoundary>` (Solid has no `componentDidCatch`) and
 * defaults its fallback to {@link ErrorOverview}, so a thrown child shows the
 * overlay instead of crashing the render.
 */
export function TuiErrorBoundary(props: TuiErrorBoundaryProps): JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error, reset) =>
        props.fallback ? props.fallback(error, reset) : <ErrorOverview error={error} />
      }
    >
      {props.children}
    </ErrorBoundary>
  );
}
