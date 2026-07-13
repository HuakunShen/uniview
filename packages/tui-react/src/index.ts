import type { ReactElement } from "react";
import {
  HandlerRegistry,
  createRenderer,
  render as reactRender,
  serializeTree,
  unmount,
} from "@uniview/react-renderer";
import { TuiHost } from "@uniview/host-tui";
import {
  FocusManager,
  type CellSurface,
  type Size,
  type StyleTable,
  type TuiInputEvent,
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
 * serialized to UINode and fed to a {@link TuiHost}; input is routed back — a
 * click hit-tests to the owning node and fires its `onClick`, and keyboard
 * focus (Tab / Enter / Space) activates focusable nodes. React state updates
 * flow through as incremental frames. This is the plan's React "direct mode".
 */
export function createTuiReactRoot(options: TuiReactRootOptions): TuiReactRoot {
  const handle = createRenderer();
  const registry = new HandlerRegistry();
  const focus = new FocusManager();

  const host = new TuiHost({
    surface: options.surface,
    size: options.size,
    styles: options.styles,
    onInvokeHandler: (handlerId, payload) => {
      void registry.execute(handlerId, payload);
    },
  });

  const sync = (): void => {
    const tree = handle.rootInstance
      ? serializeTree(handle.rootInstance, registry)
      : null;
    // A root is always an element (never a bare string) in practice.
    host.setRoot(typeof tree === "string" ? null : tree);
    focus.setFocusables(host.eventTargets("onClick").map((id) => ({ id })));
  };

  const unsubscribe = handle.subscribe(sync);

  function activateFocused(): void {
    if (focus.focused) host.fireEvent(focus.focused, "onClick");
  }

  return {
    host,

    render(element: ReactElement): void {
      // React (ConcurrentRoot) commits asynchronously; `sync` runs from the
      // bridge subscription on every commit, painting each frame.
      reactRender(element, handle);
    },

    dispatchInput(event: TuiInputEvent): void {
      if (event.type === "mouse" && event.action === "up" && event.button === "left") {
        const id = host.nodeAt(event.x, event.y);
        if (id) {
          focus.focus(id, "pointer");
          host.fireEventBubbling(id, "onClick", { x: event.x, y: event.y });
        }
        return;
      }
      if (event.type === "key" && event.key === "Tab") {
        focus.move(event.shift ? "previous" : "next");
        return;
      }
      if (event.type === "key" && event.key === "Enter") {
        activateFocused();
        return;
      }
      if (event.type === "text" && event.text === " ") {
        activateFocused();
      }
    },

    destroy(): void {
      unsubscribe();
      unmount(handle);
      host.destroy();
    },
  };
}
