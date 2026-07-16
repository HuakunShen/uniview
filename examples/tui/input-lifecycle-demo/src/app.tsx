import { useState, type ReactElement } from "react";
import { Box, ErrorBoundary, ErrorOverview, Text, useInput, usePaste } from "@uniview/tui-react";

export interface AppHost {
  rerender: () => void;
  quit: () => void;
}

/**
 * The interactive body: a single line that reacts to global keys (no focused
 * control needed) and to bracketed paste. `q`/Escape quit; anything pasted is
 * echoed. Both are resolved host-side via the `InputRouter` seam — no per-event
 * round trip — which is what `useInput`/`usePaste` wrap.
 */
function Inner({ host }: { host: AppHost }): ReactElement {
  const [log, setLog] = useState("ready — press q to quit, or paste some text");
  useInput((input, key) => {
    if (input === "q" || key.escape) {
      setLog("bye");
      host.quit();
    }
  });
  usePaste((text) => setLog(`pasted: ${text}`));
  return (
    <Box border="rounded" padding={1}>
      <Text>{log}</Text>
    </Box>
  );
}

/**
 * Wraps {@link Inner} in an {@link ErrorBoundary} so a render error shows the
 * readable {@link ErrorOverview} panel instead of wrecking the terminal.
 */
export function App({ host }: { host: AppHost }): ReactElement {
  return (
    <ErrorBoundary fallback={(err: unknown) => <ErrorOverview error={err} />}>
      <Inner host={host} />
    </ErrorBoundary>
  );
}
