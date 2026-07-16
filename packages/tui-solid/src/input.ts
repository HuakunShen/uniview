import { createContext, createEffect, onCleanup, useContext } from "solid-js";
import { toInputKey, type KeyMeta } from "@uniview/tui-core";
import type { InputRouter } from "@uniview/host-tui";

/** Provides the host {@link InputRouter} to `useInput`/`usePaste`. */
export const TuiRuntimeContext = createContext<InputRouter | undefined>();

/**
 * Subscribe to global keyboard input (keys/text the focused control did not
 * consume). Same signature and mapping as `@uniview/tui-react`'s `useInput`, so
 * a plugin reads identically in either binding. Resolved host-side — no per-event
 * RPC. A no-op outside a Tui root.
 */
export function useInput(
  handler: (input: string, key: KeyMeta) => void,
  opts: { isActive?: boolean } = {},
): void {
  const router = useContext(TuiRuntimeContext);
  createEffect(() => {
    if (!router || opts.isActive === false) return;
    const unsub = router.subscribeInput((event) => {
      if (event.type !== "key" && event.type !== "text") return;
      const { input, key } = toInputKey(event);
      handler(input, key);
    });
    onCleanup(unsub);
  });
}

/** Subscribe to bracketed-paste input (the pasted text as one string). */
export function usePaste(
  handler: (text: string) => void,
  opts: { isActive?: boolean } = {},
): void {
  const router = useContext(TuiRuntimeContext);
  createEffect(() => {
    if (!router || opts.isActive === false) return;
    const unsub = router.subscribeInput((event) => {
      if (event.type === "paste") handler(event.text);
    });
    onCleanup(unsub);
  });
}
