import type { ReactElement } from "react";
import ReactReconciler from "react-reconciler";
import {
  createTerminalRenderer,
  type TerminalRendererOptions,
} from "../terminal/renderer";
import { hostConfig } from "./host-config";
import type { TuiContainer } from "./types";

const reconciler = ReactReconciler(hostConfig);

export interface TuiRootOptions extends TerminalRendererOptions {}

export interface TuiRoot {
  render: (element: ReactElement) => void;
  destroy: () => void;
}

export function createTuiRoot(options: TuiRootOptions = {}): TuiRoot {
  const terminal = createTerminalRenderer(options);

  const container: TuiContainer = {
    rootInstance: null,
    update: () => terminal.render(container.rootInstance),
  };

  const root = reconciler.createContainer(
    container,
    0,
    null,
    false,
    null,
    "",
    () => {},
    null,
  );

  return {
    render(element: ReactElement) {
      reconciler.updateContainer(element, root, null, () => {});
    },
    destroy() {
      reconciler.updateContainer(null, root, null, () => {});
      terminal.destroy();
    },
  };
}
