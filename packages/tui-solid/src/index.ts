import { createRoot } from "solid-js";
import {
  HandlerRegistry,
  getRootNode,
  render as solidRender,
  resetIdCounter,
  serializeTree,
  setRootNode,
  setUpdateCallback,
  type SolidNode,
} from "@uniview/solid-renderer";
import { InputRouter, TuiHost } from "@uniview/host-tui";
import type {
  CellSurface,
  Size,
  StyleTable,
  TuiInputEvent,
} from "@uniview/tui-core";

export interface TuiSolidRootOptions {
  surface: CellSurface;
  size: Size;
  styles?: StyleTable;
}

export interface TuiSolidRoot {
  /** The underlying terminal host. */
  readonly host: TuiHost;
  /** Mount a Solid root component. */
  render(App: () => unknown): void;
  /** Route a normalized terminal input event to the Solid tree. */
  dispatchInput(event: TuiInputEvent): void;
  /** Dispose the Solid root and tear down the host. */
  destroy(): void;
}

/**
 * Render a Solid plugin to a terminal {@link CellSurface}. Solid's fine-grained
 * reactivity commits synchronously; each update serializes to UINode and feeds
 * a {@link TuiHost}, and input routes back exactly as in the React adapter.
 * Together with @uniview/tui-react this proves the framework-agnostic host.
 *
 * Note: solid-renderer uses a single module-global root, so one Solid root may
 * be active per process at a time.
 */
export function createTuiSolidRoot(options: TuiSolidRootOptions): TuiSolidRoot {
  const registry = new HandlerRegistry();

  const host = new TuiHost({
    surface: options.surface,
    size: options.size,
    styles: options.styles,
    onInvokeHandler: (handlerId, payload) => {
      void registry.execute(handlerId, payload);
    },
  });
  const router = new InputRouter(host);

  const sync = (): void => {
    const container = getRootNode();
    const appRoot = container?.children[0] ?? null;
    const tree = appRoot ? serializeTree(appRoot, registry) : null;
    host.setRoot(tree && typeof tree !== "string" ? tree : null);
    router.onRender();
  };

  setUpdateCallback(sync);

  let dispose: (() => void) | null = null;

  return {
    host,

    render(App: () => unknown): void {
      resetIdCounter();
      const container: SolidNode = {
        _type: "element",
        id: "__root",
        type: "div",
        props: {},
        children: [],
        parent: null,
      };
      setRootNode(container);
      dispose = createRoot((disposeRoot) => {
        solidRender(() => App() as SolidNode, container);
        return disposeRoot;
      });
      sync();
    },

    dispatchInput(event: TuiInputEvent): void {
      router.dispatch(event);
    },

    destroy(): void {
      dispose?.();
      dispose = null;
      setUpdateCallback(() => {});
      host.destroy();
    },
  };
}
