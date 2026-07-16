import { createMemo, type JSX } from "solid-js";
import { renderCanvas, type CanvasDraw, type Marker } from "@uniview/tui-core";
import { renderNodeToElement } from "./content";

/** Props for {@link Canvas} — mirrors the React `CanvasProps`, same output. */
export interface CanvasProps {
  width: number;
  height: number;
  marker?: Marker;
  xBounds?: readonly [number, number];
  yBounds?: readonly [number, number];
  draw: CanvasDraw;
}

/**
 * A public drawing surface. Same pure `renderCanvas` as the React `<Canvas>`, so
 * a drawing renders identically under either framework. `createMemo` rebuilds
 * the RenderNode when a prop changes (the charts pattern).
 */
export function Canvas(props: CanvasProps): JSX.Element {
  const node = createMemo(() =>
    renderCanvas(
      {
        width: props.width,
        height: props.height,
        marker: props.marker,
        xBounds: props.xBounds,
        yBounds: props.yBounds,
      },
      props.draw,
    ),
  );
  return <>{renderNodeToElement(node())}</>;
}
