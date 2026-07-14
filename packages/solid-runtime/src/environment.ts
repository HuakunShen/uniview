import { createSignal } from "solid-js"
import {
	DEFAULT_HOST_ENVIRONMENT,
	type ColorScheme,
	type HostEnvironment
} from "@uniview/protocol"

/**
 * The host's state (dark mode, accent color, reduced motion) as a Solid signal.
 *
 * Same store as the React runtime's, in Solid's idiom: an accessor, not a hook.
 * A plugin owns its whole runtime — one Worker, one process, one root — so a
 * module-level signal is the honest shape, and non-component code can read it.
 */

const [environment, setEnvironment] = createSignal<HostEnvironment>(DEFAULT_HOST_ENVIRONMENT)

/** Merge in what the host pushed. Called by the runtime, not by plugin code. */
export function setHostEnvironment(patch: Partial<HostEnvironment>): void {
	setEnvironment((current) => ({ ...current, ...patch }))
}

/** The full host environment. Reactive — read it inside a tracking scope. */
export const hostEnvironment = environment

/**
 * `"dark"` or `"light"`, as the *host* resolves it — a window can be light while
 * the system is dark, and this follows the window.
 *
 * You don't need this for `bg-card` or `text-foreground`: those reach the native
 * host as names and adapt per view, with no re-render. Reach for it when the
 * plugin has to *decide* — which chart palette, which illustration.
 */
export function colorScheme(): ColorScheme {
	return environment().colorScheme
}
