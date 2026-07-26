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

/**
 * Drop back to the default environment. Called by the runtime when it tears a
 * plugin down, not by plugin code.
 *
 * The "one Worker, one process, one root" premise above holds for a Worker; on
 * the main thread it does not, and a second plugin in the same process would
 * otherwise open in the first one's dark mode and accent color. Assigns rather
 * than merges: the default omits `accentColor` and friends, so patching it over
 * the current value would leave them behind.
 */
export function resetHostEnvironment(): void {
	setEnvironment(DEFAULT_HOST_ENVIRONMENT)
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
