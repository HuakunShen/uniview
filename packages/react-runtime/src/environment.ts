import { useSyncExternalStore } from "react";
import {
  DEFAULT_HOST_ENVIRONMENT,
  type ColorScheme,
  type HostEnvironment,
} from "@uniview/protocol";

/**
 * The host's state, as the plugin sees it — dark mode, accent color, reduced
 * motion — and the hooks that read it.
 *
 * A module-level store rather than a React context, which is how React Native
 * does it (`Appearance` is a singleton) and for the same reason: a plugin owns
 * its entire runtime — one Worker, one process, one React root — so there is no
 * second environment to be in, and no provider anyone can forget to mount. It
 * also means non-React code (a data layer picking a chart palette) can read it.
 */

let current: HostEnvironment = DEFAULT_HOST_ENVIRONMENT;
const listeners = new Set<() => void>();

function shallowEqual(a: HostEnvironment, b: HostEnvironment): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof HostEnvironment
  >;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/**
 * Merge in what the host pushed. Called by the runtime, not by plugin code.
 *
 * A no-op push must not change the snapshot's identity: hosts re-send the whole
 * environment on events like window activation, and `useSyncExternalStore` would
 * re-render the entire tree on each one if the object were rebuilt every time.
 */
export function setHostEnvironment(patch: Partial<HostEnvironment>): void {
  const next: HostEnvironment = { ...current, ...patch };
  if (shallowEqual(next, current)) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): HostEnvironment {
  return current;
}

/** Read the host environment outside React (RN's `Appearance.getColorScheme()`). */
export function getHostEnvironment(): HostEnvironment {
  return current;
}

/** The full host environment, re-rendering the component when it changes. */
export function useHostEnvironment(): HostEnvironment {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * `"dark"` or `"light"` — whatever the *host* says, which is not necessarily what
 * the system says: a window can carry `<Window appearance="light">` while the OS
 * is dark, and this follows the window.
 *
 * You do not need this to make `bg-card` or `text-foreground` correct — those are
 * resolved natively, per view. Reach for it when the plugin has to *decide*
 * something: which chart palette, which illustration, which of two icons.
 */
export function useColorScheme(): ColorScheme {
  return useHostEnvironment().colorScheme;
}
