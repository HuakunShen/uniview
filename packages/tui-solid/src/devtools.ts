/** Options for {@link connectSolidDevTools}. */
export interface DevToolsOptions {
  /** Force on/off. Defaults to `process.env.TUI_DEVTOOLS === "1"`. */
  enabled?: boolean;
  /** Injectable connector (for tests). Defaults to the solid-devtools hookup. */
  connect?: () => void | Promise<void>;
}

function devFlag(): boolean {
  return typeof process !== "undefined" && process.env?.TUI_DEVTOOLS === "1";
}

/**
 * Connect the plugin to Solid DevTools when a dev flag is set. The devtools
 * package is *dynamically imported behind the flag* (a variable specifier, so
 * it need not be installed for production builds/type-checks) and any failure
 * — including the package being absent — is swallowed: devtools is best-effort.
 */
export async function connectSolidDevTools(opts: DevToolsOptions = {}): Promise<void> {
  const enabled = opts.enabled ?? devFlag();
  if (!enabled) return;
  const connect =
    opts.connect ??
    (async () => {
      const specifier = "solid-devtools";
      await import(specifier); // side-effect: enables the Solid devtools overlay
    });
  try {
    await connect();
  } catch (error) {
    console.warn("[tui-solid] devtools connection failed:", error);
  }
}
