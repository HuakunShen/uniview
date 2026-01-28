import type { ReactElement } from "react";
import ReactReconciler from "react-reconciler";
import { hostConfig } from "./host-config";
import { createRenderBridge, type RenderBridge } from "./bridge";

const reconciler = ReactReconciler(hostConfig);

interface RendererHandle extends RenderBridge {
  _container?: ReturnType<typeof reconciler.createContainer>;
}

export function createRenderer(): RendererHandle {
  const bridge = createRenderBridge();
  return { ...bridge, _container: undefined };
}

export function render(element: ReactElement, handle: RendererHandle): void {
  if (!handle._container) {
    handle._container = reconciler.createContainer(
      handle,
      0,
      null,
      false,
      null,
      "",
      () => {},
      null,
    );
  }

  reconciler.updateContainer(element, handle._container, null, () => {});
}

export { createRenderBridge, type RenderBridge };
