import type { ReactElement } from "react";
import ReactReconciler from "react-reconciler";
import { ConcurrentRoot } from "react-reconciler/constants";
import { hostConfig } from "./host-config";
import { createRenderBridge, type RenderBridge } from "./bridge";

const reconciler = ReactReconciler(hostConfig);

interface SynchronousReconciler {
  flushSyncFromReconciler<Result>(callback: () => Result): Result;
  flushPassiveEffects(): boolean;
  isAlreadyRendering(): boolean;
}

// react-reconciler 0.33 exposes this runtime API while the matching Definitely
// Typed declaration still calls it `flushSync`. Keep the compatibility seam
// narrow and typed until the upstream declaration catches up.
const synchronousReconciler: SynchronousReconciler =
  reconciler as typeof reconciler & SynchronousReconciler;

interface RendererHandle extends RenderBridge {
  _container?: ReturnType<typeof reconciler.createContainer>;
}

export function createRenderer(): RendererHandle {
  const bridge = createRenderBridge();
  return { ...bridge, _container: undefined };
}

export function render(element: ReactElement, handle: RendererHandle): void {
  if (!handle._container) {
    // Uncaught errors go to the bridge's onError (wired to the host's
    // reportError RPC by the runtimes) so plugin crashes are visible to
    // the host instead of dying silently in a worker console.
    const reportUncaught = (error: unknown) => {
      if (handle.onError) {
        handle.onError(error);
      } else {
        console.error(error);
      }
    };
    handle._container = reconciler.createContainer(
      handle,
      ConcurrentRoot,
      null,
      false,
      null,
      "",
      reportUncaught,
      console.error,
      console.error,
      console.error,
      null,
    );
  }

  reconciler.updateContainer(element, handle._container, null, () => {});
}

/**
 * Unmount the tree rendered into this handle, running effect cleanups and
 * releasing the container. Without this, destroy() only dropped references
 * while timers/effects/subscriptions in the plugin kept running forever.
 */
export function unmount(handle: RendererHandle): void {
  if (synchronousReconciler.isAlreadyRendering()) {
    throw new Error(
      "Cannot destroy a React renderer during React work; schedule destroy outside render, commit, or effects (for example with queueMicrotask)",
    );
  }

  const container = handle._container;
  if (container) {
    synchronousReconciler.flushSyncFromReconciler(() => {
      reconciler.updateContainer(null, container, null, () => {});
    });
    synchronousReconciler.flushPassiveEffects();
    handle._container = undefined;
  }
  handle.rootInstance = null;
}

export { createRenderBridge, type RenderBridge };
