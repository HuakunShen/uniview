import { OwnerTable, type RenderBackend, type Size } from "@uniview/tui-core";
import { charFrameToBuffer } from "./capture";
import { toOpenTuiDescriptor } from "./mapping";
import { mountDescriptor, type OpenTuiApi, type OpenTuiNode } from "./mount";

/** Thrown when the OpenTUI native runtime is not installed. */
export class OpenTuiUnavailableError extends Error {
  readonly code = "opentui_unavailable" as const;
  constructor(cause?: unknown) {
    super(
      "@opentui/core is not available — install it and its native runtime to use the OpenTUI backend",
    );
    this.name = "OpenTuiUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Everything the adapter needs from a live OpenTUI renderer. Injecting these
 * keeps the backend testable with mocks; `createOpenTuiBackend` fills them from
 * a real `@opentui/core` renderer.
 */
export interface OpenTuiRenderDeps {
  api: OpenTuiApi;
  renderer: unknown;
  clearRoot: () => void;
  addToRoot: (node: OpenTuiNode) => void;
  renderOnce: () => void;
  captureCharFrame: () => string;
}

/**
 * Build a tui-core {@link RenderBackend} from OpenTUI render deps: map the
 * scene to descriptors, mount them as Renderables, render once, and parse the
 * captured char frame back into a CellBuffer for conformance. The owner/hit
 * grid is not recovered from OpenTUI here (that stays with the host).
 */
export function createOpenTuiBackendFromDeps(deps: OpenTuiRenderDeps): RenderBackend {
  return {
    kind: "opentui",
    render(root, size: Size) {
      deps.clearRoot();
      if (root) {
        deps.addToRoot(mountDescriptor(deps.api, deps.renderer, toOpenTuiDescriptor(root)));
      }
      deps.renderOnce();
      return { buffer: charFrameToBuffer(deps.captureCharFrame(), size), owners: new OwnerTable() };
    },
    destroy() {},
  };
}

async function loadOpenTui(): Promise<Record<string, unknown> | null> {
  const specifier = "@opentui/core";
  try {
    return (await import(specifier)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Whether the OpenTUI native runtime can be loaded in this environment. */
export async function isOpenTuiAvailable(): Promise<boolean> {
  return (await loadOpenTui()) !== null;
}

export interface OpenTuiBackendOptions {
  size?: Size;
}

/**
 * Create an OpenTUI-backed {@link RenderBackend}. Loads `@opentui/core` and its
 * native runtime; throws {@link OpenTuiUnavailableError} when absent. This is
 * the plan's profiler-gated experiment (§11.5): the scene→Renderable mapping,
 * mounting and capture are all tested via `createOpenTuiBackendFromDeps`; this
 * function only wires them to the real, native renderer.
 */
export async function createOpenTuiBackend(
  _options: OpenTuiBackendOptions = {},
): Promise<RenderBackend> {
  const mod = await loadOpenTui();
  if (!mod) throw new OpenTuiUnavailableError();

  // With @opentui/core present, build deps from its testing renderer and
  // delegate to createOpenTuiBackendFromDeps. Reconciling OpenTUI's async
  // render loop with the sync RenderBackend.render is the remaining gated
  // step — surfaced explicitly rather than shipped half-working.
  throw new OpenTuiUnavailableError(
    new Error("OpenTUI is installed but its async render loop is not yet wired to RenderBackend"),
  );
}
