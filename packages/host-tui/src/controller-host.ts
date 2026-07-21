import type { HandlerId, JSONValue, UINode } from "@uniview/protocol/core";
import type { CellSurface, Size, StyleTable, TuiInputEvent } from "@uniview/tui-core";
import { InputRouter } from "./input-router";
import { TuiHost } from "./tui-host";

/**
 * The subset of the host-sdk `PluginController` this host binds to. Any
 * Worker / WebSocket / Main controller is structurally compatible, so the
 * terminal host works over every transport without depending on host-sdk.
 */
export interface RemoteController {
  subscribe(callback: (tree: UINode | null) => void): () => void;
  executeHandler(handlerId: HandlerId, args?: JSONValue[]): void | Promise<void>;
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  destroy?(): void | Promise<void>;
}

export interface ControllerHostOptions {
  surface: CellSurface;
  size: Size;
  styles?: StyleTable;
}

export interface ControllerHost {
  readonly host: TuiHost;
  connect(): Promise<void>;
  dispatchInput(event: TuiInputEvent): void;
  destroy(): Promise<void>;
}

/**
 * Drive a {@link TuiHost} from a {@link RemoteController}: the controller's tree
 * updates become frames, and the host's events become `executeHandler` calls
 * back to the (possibly isolated) plugin. This makes Worker and WebSocket
 * plugins render and interact in the terminal identically to direct mode —
 * the plan's Phase 7 transport parity.
 */
export function createControllerHost(
  controller: RemoteController,
  options: ControllerHostOptions,
): ControllerHost {
  const host = new TuiHost({
    surface: options.surface,
    size: options.size,
    styles: options.styles,
    onInvokeHandler: (handlerId, payload) => {
      void controller.executeHandler(handlerId, payload === undefined ? [] : [payload]);
    },
  });
  const router = new InputRouter(host);

  const unsubscribe = controller.subscribe((tree) => {
    host.setRoot(tree);
    router.onRender();
  });

  return {
    host,

    async connect(): Promise<void> {
      await controller.connect?.();
    },

    dispatchInput(event: TuiInputEvent): void {
      router.dispatch(event);
    },

    async destroy(): Promise<void> {
      unsubscribe();
      await controller.disconnect?.();
      await controller.destroy?.();
      host.destroy();
    },
  };
}
