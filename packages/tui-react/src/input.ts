import { createContext, useContext, useEffect, useRef } from "react";
import { toInputKey, type KeyMeta } from "@uniview/tui-core";
import type { InputRouter } from "@uniview/host-tui";

/** Provides the host {@link InputRouter} to `useInput`/`usePaste`. */
export const TuiRuntimeContext = createContext<InputRouter | undefined>(undefined);

/**
 * Subscribe to global keyboard input (keys/text the focused control did not
 * consume). `input` is the printable string; `key` is ink-style flags. Resolved
 * host-side via the router seam — no per-event RPC. A no-op outside a Tui root.
 */
export function useInput(
  handler: (input: string, key: KeyMeta) => void,
  opts: { isActive?: boolean } = {},
): void {
  const router = useContext(TuiRuntimeContext);
  const isActive = opts.isActive ?? true;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!router || !isActive) return;
    return router.subscribeInput((event) => {
      if (event.type !== "key" && event.type !== "text") return;
      const { input, key } = toInputKey(event);
      handlerRef.current(input, key);
    });
  }, [router, isActive]);
}

/** Subscribe to bracketed-paste input (the pasted text as one string). */
export function usePaste(
  handler: (text: string) => void,
  opts: { isActive?: boolean } = {},
): void {
  const router = useContext(TuiRuntimeContext);
  const isActive = opts.isActive ?? true;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!router || !isActive) return;
    return router.subscribeInput((event) => {
      if (event.type === "paste") handlerRef.current(event.text);
    });
  }, [router, isActive]);
}
