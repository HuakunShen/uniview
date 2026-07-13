import {
  borderInsets,
  resolveDimension,
  resolveInsets,
  type TuiStyle,
} from "../style/tui-style";
import type { Size } from "../surface/types";

/** A resolved rectangle in terminal cells. */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MeasureConstraints {
  maxWidth: number;
  maxHeight: number;
}

/**
 * A structural layout node. `measure` marks a leaf (e.g. text) that reports its
 * own intrinsic size; otherwise `children` are laid out with flexbox rules.
 */
export interface LayoutInput {
  id?: string;
  style?: TuiStyle;
  children?: LayoutInput[];
  measure?: (constraints: MeasureConstraints) => Size;
}

export interface LayoutResult {
  input: LayoutInput;
  box: LayoutBox;
  children: LayoutResult[];
}

const EMPTY_STYLE: TuiStyle = {};

function isHorizontal(style: TuiStyle): boolean {
  const dir = style.flexDirection ?? "column";
  return dir === "row" || dir === "row-reverse";
}

function mainGap(style: TuiStyle, horizontal: boolean): number {
  if (horizontal) return style.columnGap ?? style.gap ?? 0;
  return style.rowGap ?? style.gap ?? 0;
}

function clamp(value: number, min?: number, max?: number): number {
  let v = value;
  if (min !== undefined) v = Math.max(v, min);
  if (max !== undefined) v = Math.min(v, max);
  return v;
}

function extents(style: TuiStyle): { h: number; v: number } {
  const border = borderInsets(style);
  const pad = resolveInsets(style.padding);
  return {
    h: border.left + border.right + pad.left + pad.right,
    v: border.top + border.bottom + pad.top + pad.bottom,
  };
}

/** Intrinsic outer size of a node given the space available to it. */
function intrinsicSize(node: LayoutInput, avail: Size): Size {
  const style = node.style ?? EMPTY_STYLE;
  const { h: hExtra, v: vExtra } = extents(style);

  let width = resolveDimension(style.width, avail.width);
  let height = resolveDimension(style.height, avail.height);

  const inner: Size = {
    width: (width ?? avail.width) - hExtra,
    height: (height ?? avail.height) - vExtra,
  };

  if (node.measure) {
    const measured = node.measure({ maxWidth: inner.width, maxHeight: inner.height });
    if (width === undefined) width = measured.width + hExtra;
    if (height === undefined) height = measured.height + vExtra;
  } else if (width === undefined || height === undefined) {
    const content = contentSize(node, inner);
    if (width === undefined) width = content.width + hExtra;
    if (height === undefined) height = content.height + vExtra;
  }

  return {
    width: Math.max(
      0,
      clamp(
        width ?? 0,
        resolveDimension(style.minWidth, avail.width),
        resolveDimension(style.maxWidth, avail.width),
      ),
    ),
    height: Math.max(
      0,
      clamp(
        height ?? 0,
        resolveDimension(style.minHeight, avail.height),
        resolveDimension(style.maxHeight, avail.height),
      ),
    ),
  };
}

/** Content size of a container from its children (main-axis sum, cross-axis max). */
function contentSize(node: LayoutInput, inner: Size): Size {
  const style = node.style ?? EMPTY_STYLE;
  const horizontal = isHorizontal(style);
  const gap = mainGap(style, horizontal);
  const children = node.children ?? [];

  let main = 0;
  let cross = 0;
  children.forEach((child, i) => {
    const size = intrinsicSize(child, inner);
    const childMain = horizontal ? size.width : size.height;
    const childCross = horizontal ? size.height : size.width;
    if (i > 0) main += gap;
    main += childMain;
    cross = Math.max(cross, childCross);
  });

  return horizontal ? { width: main, height: cross } : { width: cross, height: main };
}

/** Place a node and its subtree inside `box` (its final outer rectangle). */
function arrange(node: LayoutInput, box: LayoutBox): LayoutResult {
  const style = node.style ?? EMPTY_STYLE;
  const children = node.children ?? [];
  if (node.measure || children.length === 0) {
    return { input: node, box, children: [] };
  }

  const border = borderInsets(style);
  const pad = resolveInsets(style.padding);
  const inner: LayoutBox = {
    x: box.x + border.left + pad.left,
    y: box.y + border.top + pad.top,
    width: box.width - border.left - border.right - pad.left - pad.right,
    height: box.height - border.top - border.bottom - pad.top - pad.bottom,
  };

  const horizontal = isHorizontal(style);
  const gap = mainGap(style, horizontal);
  const mainSize = horizontal ? inner.width : inner.height;
  const crossSize = horizontal ? inner.height : inner.width;

  const sizes = children.map((c) =>
    intrinsicSize(c, { width: inner.width, height: inner.height }),
  );
  const mains = sizes.map((s) => (horizontal ? s.width : s.height));
  const grows = children.map((c) => c.style?.flexGrow ?? 0);
  const totalGrow = grows.reduce((a, b) => a + b, 0);
  const totalGap = gap * Math.max(0, children.length - 1);

  // Distribute free main-axis space to flex-grow children.
  const used = mains.reduce((a, b) => a + b, 0) + totalGap;
  let free = mainSize - used;
  if (totalGrow > 0 && free > 0) {
    const per = free / totalGrow;
    let remaining = free;
    children.forEach((_, i) => {
      if (grows[i]! > 0) {
        const add = Math.round(per * grows[i]!);
        mains[i]! += add;
        remaining -= add;
      }
    });
    for (let i = children.length - 1; i >= 0 && remaining !== 0; i -= 1) {
      if (grows[i]! > 0) {
        mains[i]! += remaining;
        remaining = 0;
      }
    }
    free = 0;
  }

  // justifyContent only matters when free space remains (no grow consumed it).
  const justify = style.justifyContent ?? "start";
  const leftover = mainSize - (mains.reduce((a, b) => a + b, 0) + totalGap);
  let mainStart = horizontal ? inner.x : inner.y;
  let betweenGap = gap;
  if (leftover > 0) {
    if (justify === "center") mainStart += Math.floor(leftover / 2);
    else if (justify === "end") mainStart += leftover;
    else if (justify === "space-between" && children.length > 1) {
      betweenGap = gap + leftover / (children.length - 1);
    } else if (justify === "space-around" && children.length > 0) {
      const around = leftover / children.length;
      mainStart += Math.floor(around / 2);
      betweenGap = gap + around;
    }
  }

  const results: LayoutResult[] = [];
  let cursor = mainStart;
  children.forEach((child, i) => {
    const childMain = mains[i]!;
    let childCross = horizontal ? sizes[i]!.height : sizes[i]!.width;

    const selfAlign = child.style?.alignSelf;
    const align =
      selfAlign && selfAlign !== "auto" ? selfAlign : style.alignItems ?? "stretch";
    let crossStart = horizontal ? inner.y : inner.x;
    if (align === "stretch") childCross = crossSize;
    else if (align === "center") crossStart += Math.floor((crossSize - childCross) / 2);
    else if (align === "end") crossStart += crossSize - childCross;

    const childBox: LayoutBox = horizontal
      ? { x: Math.round(cursor), y: Math.round(crossStart), width: childMain, height: childCross }
      : { x: Math.round(crossStart), y: Math.round(cursor), width: childCross, height: childMain };

    results.push(arrange(child, childBox));
    cursor += childMain + betweenGap;
  });

  return { input: node, box, children: results };
}

/**
 * Lay out `root` inside a `container`. An absent width/height fills the
 * container (screen behavior); an explicit `"auto"` shrinks to content.
 */
export function computeLayout(root: LayoutInput, container: Size): LayoutResult {
  const style = root.style ?? EMPTY_STYLE;
  const intrinsic = intrinsicSize(root, container);
  const width = style.width === undefined ? container.width : intrinsic.width;
  const height = style.height === undefined ? container.height : intrinsic.height;
  return arrange(root, { x: 0, y: 0, width, height });
}
