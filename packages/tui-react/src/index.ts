import type { ReactElement } from "react";
import {
  HandlerRegistry,
  createRenderer,
  render as reactRender,
  serializeTree,
  unmount,
} from "@uniview/react-renderer";
import { InputRouter, TuiHost } from "@uniview/host-tui";
import type {
  CellSurface,
  Size,
  StyleTable,
  TuiInputEvent,
} from "@uniview/tui-core";

export interface TuiReactRootOptions {
  surface: CellSurface;
  size: Size;
  styles?: StyleTable;
}

export interface TuiReactRoot {
  /** The underlying terminal host. */
  readonly host: TuiHost;
  /** Mount (or replace) the React element. */
  render(element: ReactElement): void;
  /** Route a normalized terminal input event to the React tree. */
  dispatchInput(event: TuiInputEvent): void;
  /** Unmount React and tear down the host. */
  destroy(): void;
}

/**
 * Render a React plugin to a terminal {@link CellSurface}. React commits are
 * serialized to UINode and fed to a {@link TuiHost}; an {@link InputRouter}
 * routes input back — click/Enter/Space activate buttons and typing edits the
 * focused text field (firing onChange/onSubmit). React state updates flow
 * through as incremental frames. This is the plan's React "direct mode".
 */
export function createTuiReactRoot(options: TuiReactRootOptions): TuiReactRoot {
  const handle = createRenderer();
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
    const tree = handle.rootInstance
      ? serializeTree(handle.rootInstance, registry)
      : null;
    // A root is always an element (never a bare string) in practice.
    host.setRoot(typeof tree === "string" ? null : tree);
    router.onRender();
  };

  const unsubscribe = handle.subscribe(sync);

  return {
    host,

    render(element: ReactElement): void {
      // React (ConcurrentRoot) commits asynchronously; `sync` runs from the
      // bridge subscription on every commit, painting each frame.
      reactRender(element, handle);
    },

    dispatchInput(event: TuiInputEvent): void {
      router.dispatch(event);
    },

    destroy(): void {
      unsubscribe();
      unmount(handle);
      host.destroy();
    },
  };
}
