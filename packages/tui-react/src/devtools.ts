/** Options for {@link connectReactDevTools}. */
export interface DevToolsOptions {
  /** Force on/off. Defaults to `process.env.TUI_DEVTOOLS === "1"`. */
  enabled?: boolean;
  /** Injectable connector (for tests). Defaults to the react-devtools-core hookup. */
  connect?: () => void | Promise<void>;
}

/** Minimal shape of the optional `react-devtools-core` module. */
interface ReactDevToolsModule {
  connectToDevTools(options?: { host?: string; port?: number }): void;
}

function devFlag(): boolean {
  return typeof process !== "undefined" && process.env?.TUI_DEVTOOLS === "1";
}

/**
 * Connect the plugin to React DevTools when a dev flag is set. The devtools
 * package is *dynamically imported behind the flag* (a variable specifier, so
 * it need not be installed for production builds/type-checks) and any failure
 * — including the package being absent — is swallowed: devtools is best-effort.
 */
export async function connectReactDevTools(opts: DevToolsOptions = {}): Promise<void> {
  const enabled = opts.enabled ?? devFlag();
  if (!enabled) return;
  const connect =
    opts.connect ??
    (async () => {
      const specifier = "react-devtools-core";
      const mod = (await import(specifier)) as ReactDevToolsModule;
      mod.connectToDevTools();
    });
  try {
    await connect();
  } catch (error) {
    console.warn("[tui-react] devtools connection failed:", error);
  }
}
