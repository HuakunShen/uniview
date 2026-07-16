import Yoga, {
  Align,
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  PositionType,
} from "yoga-layout";
import type { LayoutEngine } from "./engine";
import type { LayoutBox, LayoutInput, LayoutResult } from "./layout";
import { borderInsets, resolveInsets, type Dimension, type TuiStyle } from "../style/tui-style";
import type { Size } from "../surface/types";

type YogaNode = ReturnType<typeof Yoga.Node.create>;

const EMPTY_STYLE: TuiStyle = {};

// One shared config: round computed geometry to whole terminal cells.
const config = Yoga.Config.create();
config.setPointScaleFactor(1);

/** Set a Yoga length setter from a {@link Dimension}: number, "N%", or "auto". */
function setDimension(
  value: Dimension | undefined,
  setPoint: (n: number) => void,
  setPercent: (n: number) => void,
  setAuto?: () => void,
): void {
  if (value === undefined) return;
  if (value === "auto") {
    setAuto?.();
    return;
  }
  if (typeof value === "number") {
    setPoint(value);
    return;
  }
  const match = /^(-?\d+(?:\.\d+)?)%$/.exec(value);
  if (match) setPercent(Number(match[1]));
}

function flexDirectionOf(style: TuiStyle): FlexDirection {
  switch (style.flexDirection) {
    case "row":
      return FlexDirection.Row;
    case "row-reverse":
      return FlexDirection.RowReverse;
    case "column-reverse":
      return FlexDirection.ColumnReverse;
    default:
      return FlexDirection.Column;
  }
}

function justifyOf(style: TuiStyle): Justify | undefined {
  switch (style.justifyContent) {
    case "center":
      return Justify.Center;
    case "end":
      return Justify.FlexEnd;
    case "space-between":
      return Justify.SpaceBetween;
    case "space-around":
      return Justify.SpaceAround;
    case "start":
      return Justify.FlexStart;
    default:
      return undefined;
  }
}

function alignOf(value: TuiStyle["alignItems"] | TuiStyle["alignSelf"]): Align | undefined {
  switch (value) {
    case "start":
      return Align.FlexStart;
    case "center":
      return Align.Center;
    case "end":
      return Align.FlexEnd;
    case "stretch":
      return Align.Stretch;
    case "auto":
      return Align.Auto;
    default:
      return undefined;
  }
}

/** Map one {@link LayoutInput} node's style + measure onto a fresh Yoga node. */
function buildNode(input: LayoutInput): YogaNode {
  const node = Yoga.Node.createWithConfig(config);
  const style = input.style ?? EMPTY_STYLE;

  node.setFlexDirection(flexDirectionOf(style));
  if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow);
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink);

  const justify = justifyOf(style);
  if (justify !== undefined) node.setJustifyContent(justify);
  const alignItems = alignOf(style.alignItems);
  if (alignItems !== undefined) node.setAlignItems(alignItems);
  const alignSelf = alignOf(style.alignSelf);
  if (alignSelf !== undefined) node.setAlignSelf(alignSelf);

  setDimension(
    style.width,
    (n) => node.setWidth(n),
    (n) => node.setWidthPercent(n),
    () => node.setWidthAuto(),
  );
  setDimension(
    style.height,
    (n) => node.setHeight(n),
    (n) => node.setHeightPercent(n),
    () => node.setHeightAuto(),
  );
  setDimension(
    style.minWidth,
    (n) => node.setMinWidth(n),
    (n) => node.setMinWidthPercent(n),
  );
  setDimension(
    style.maxWidth,
    (n) => node.setMaxWidth(n),
    (n) => node.setMaxWidthPercent(n),
  );
  setDimension(
    style.minHeight,
    (n) => node.setMinHeight(n),
    (n) => node.setMinHeightPercent(n),
  );
  setDimension(
    style.maxHeight,
    (n) => node.setMaxHeight(n),
    (n) => node.setMaxHeightPercent(n),
  );

  const pad = resolveInsets(style.padding);
  node.setPadding(Edge.Top, pad.top);
  node.setPadding(Edge.Right, pad.right);
  node.setPadding(Edge.Bottom, pad.bottom);
  node.setPadding(Edge.Left, pad.left);

  // A visible border occupies one cell per side — same box-model contribution
  // as the custom engine's `borderInsets`.
  const border = borderInsets(style);
  node.setBorder(Edge.Top, border.top);
  node.setBorder(Edge.Right, border.right);
  node.setBorder(Edge.Bottom, border.bottom);
  node.setBorder(Edge.Left, border.left);

  if (style.gap !== undefined) node.setGap(Gutter.All, style.gap);
  if (style.rowGap !== undefined) node.setGap(Gutter.Row, style.rowGap);
  if (style.columnGap !== undefined) node.setGap(Gutter.Column, style.columnGap);

  if (style.position === "absolute") {
    node.setPositionType(PositionType.Absolute);
    setDimension(
      style.top,
      (n) => node.setPosition(Edge.Top, n),
      (n) => node.setPositionPercent(Edge.Top, n),
    );
    setDimension(
      style.right,
      (n) => node.setPosition(Edge.Right, n),
      (n) => node.setPositionPercent(Edge.Right, n),
    );
    setDimension(
      style.bottom,
      (n) => node.setPosition(Edge.Bottom, n),
      (n) => node.setPositionPercent(Edge.Bottom, n),
    );
    setDimension(
      style.left,
      (n) => node.setPosition(Edge.Left, n),
      (n) => node.setPositionPercent(Edge.Left, n),
    );
  }

  if (input.measure) {
    // A measured leaf must have no children — route Yoga's measure request into
    // the SAME `input.measure` the custom engine and text pipeline use.
    const measure = input.measure;
    node.setMeasureFunc((width, widthMode, height, heightMode) => {
      const maxWidth = widthMode === MeasureMode.Undefined ? Number.POSITIVE_INFINITY : width;
      const maxHeight = heightMode === MeasureMode.Undefined ? Number.POSITIVE_INFINITY : height;
      const size = measure({ maxWidth, maxHeight });
      return { width: size.width, height: size.height };
    });
    return node;
  }

  // Insert children in input order so `readLayout` can pair getChild(i) with
  // input.children[i] — the index invariant `paintNode` depends on.
  (input.children ?? []).forEach((child, i) => {
    node.insertChild(buildNode(child), i);
  });
  return node;
}

/** Read Yoga's computed (parent-relative) geometry back into an absolute LayoutResult. */
function readLayout(node: YogaNode, input: LayoutInput, absX: number, absY: number): LayoutResult {
  const box: LayoutBox = {
    x: absX,
    y: absY,
    width: Math.round(node.getComputedWidth()),
    height: Math.round(node.getComputedHeight()),
  };
  const inputs = input.children ?? [];
  const children: LayoutResult[] = inputs.map((childInput, i) => {
    const childNode = node.getChild(i);
    const childX = absX + Math.round(childNode.getComputedLeft());
    const childY = absY + Math.round(childNode.getComputedTop());
    return readLayout(childNode, childInput, childX, childY);
  });
  return { input, box, children };
}

function computeLayout(root: LayoutInput, container: Size): LayoutResult {
  const style = root.style ?? EMPTY_STYLE;
  const node = buildNode(root);
  try {
    // The custom engine's contract: an absent root width/height fills the
    // container; an explicit value (incl. "auto"/"%") is resolved normally.
    if (style.width === undefined) node.setWidth(container.width);
    if (style.height === undefined) node.setHeight(container.height);

    node.calculateLayout(container.width, container.height, Direction.LTR);
    return readLayout(node, root, 0, 0);
  } finally {
    node.freeRecursive();
  }
}

/**
 * A {@link LayoutEngine} backed by `yoga-layout`. A drop-in for
 * {@link customLayoutEngine} with correct flexbox — notably fixing the
 * `height:"100%"` / `flexGrow` overflow the pure-TS engine documents.
 */
export const yogaLayoutEngine: LayoutEngine = { computeLayout };
