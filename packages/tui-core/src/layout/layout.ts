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

function isReverse(style: TuiStyle): boolean {
  const dir = style.flexDirection ?? "column";
  return dir === "row-reverse" || dir === "column-reverse";
}

function isAbsolute(node: LayoutInput): boolean {
  return node.style?.position === "absolute";
}

/** Resolve the box of an absolutely-positioned child within its parent's inner area. */
function absoluteBox(node: LayoutInput, inner: LayoutBox): LayoutBox {
  const style = node.style ?? EMPTY_STYLE;
  const left = resolveDimension(style.left, inner.width);
  const right = resolveDimension(style.right, inner.width);
  const top = resolveDimension(style.top, inner.height);
  const bottom = resolveDimension(style.bottom, inner.height);

  const intrinsic = intrinsicSize(node, { width: inner.width, height: inner.height });
  let width = resolveDimension(style.width, inner.width);
  if (width === undefined) {
    width = left !== undefined && right !== undefined ? inner.width - left - right : intrinsic.width;
  }
  let height = resolveDimension(style.height, inner.height);
  if (height === undefined) {
    height =
      top !== undefined && bottom !== undefined ? inner.height - top - bottom : intrinsic.height;
  }

  const x =
    left !== undefined
      ? inner.x + left
      : right !== undefined
        ? inner.x + inner.width - width - right
        : inner.x;
  const y =
    top !== undefined
      ? inner.y + top
      : bottom !== undefined
        ? inner.y + inner.height - height - bottom
        : inner.y;

  return { x, y, width: Math.max(0, width), height: Math.max(0, height) };
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

/**
 * KNOWN LIMITATION: percentage main-axis sizes are resolved against
 * `avail` — the ancestor's *available* space at measure time — rather than
 * the space actually left over after sibling sizes are subtracted. When a
 * `flexGrow` container holds a `height:"100%"` child alongside a
 * fixed-height sibling (column direction), `contentSize` below sums both
 * children's intrinsic heights (100% of the ancestor's height, *plus* the
 * fixed sibling's height) into the parent's own intrinsic size, then that
 * inflated size is used again as `avail` when the same `height:"100%"`
 * child is re-measured during `arrange`. The two children's heights
 * double-count and the parent overflows its own box instead of the
 * `height:"100%"` child shrinking to make room for its sibling. See
 * `tests/layout/flexgrow-percentage-height.test.ts` for the pinned numbers.
 *
 * UPDATE: bringing up a real flexbox engine (`yogaLayoutEngine`, backed by
 * `yoga-layout`, behind the `LayoutEngine` seam in `./engine.ts`) settled this:
 * with `flex-basis: auto`, Yoga produces the SAME geometry — the parent is
 * content-sized to 25, the `height:"100%"` child included. So this is correct
 * `flex-basis: auto` behavior, not a bug (a `flexBasis: 0` child fills instead).
 * `yogaLayoutEngine` is available opt-in via the `layoutEngine` root option; it
 * is a stricter flexbox (it honors explicit cross-axis sizes this engine
 * stretches), so `customLayoutEngine` stays the default. See
 * `tests/layout/yoga-flexgrow-percentage-height.test.ts` for the agreement.
 */
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
  let count = 0;
  children.forEach((child) => {
    if (isAbsolute(child)) return; // out of flow — no contribution to content size
    const size = intrinsicSize(child, inner);
    const childMain = horizontal ? size.width : size.height;
    const childCross = horizontal ? size.height : size.width;
    if (count > 0) main += gap;
    main += childMain;
    cross = Math.max(cross, childCross);
    count += 1;
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

  // Absolute children are laid out independently and don't affect the flow.
  const flowIndices: number[] = [];
  children.forEach((c, i) => {
    if (!isAbsolute(c)) flowIndices.push(i);
  });
  const flow = flowIndices.map((i) => children[i]!);

  const horizontal = isHorizontal(style);
  const gap = mainGap(style, horizontal);
  const mainSize = horizontal ? inner.width : inner.height;
  const crossSize = horizontal ? inner.height : inner.width;

  const sizes = flow.map((c) =>
    intrinsicSize(c, { width: inner.width, height: inner.height }),
  );
  const mains = sizes.map((s) => (horizontal ? s.width : s.height));
  const grows = flow.map((c) => c.style?.flexGrow ?? 0);

  // `row-reverse`/`column-reverse` place the LAST child at the leading edge.
  // The placement loop below always walks index 0..n-1 from the leading edge,
  // so reversing these four parallel arrays together — keeping `flowIndices`
  // in lockstep so `results[flowIndices[k]]` still targets the right original
  // child — is enough to flip the visual order without touching the loop.
  if (isReverse(style)) {
    flow.reverse();
    flowIndices.reverse();
    sizes.reverse();
    mains.reverse();
    grows.reverse();
  }

  const totalGrow = grows.reduce((a, b) => a + b, 0);
  const totalGap = gap * Math.max(0, flow.length - 1);

  // Distribute free main-axis space to flex-grow children.
  const used = mains.reduce((a, b) => a + b, 0) + totalGap;
  let free = mainSize - used;
  if (totalGrow > 0 && free > 0) {
    const per = free / totalGrow;
    let remaining = free;
    flow.forEach((_, i) => {
      if (grows[i]! > 0) {
        const add = Math.round(per * grows[i]!);
        mains[i]! += add;
        remaining -= add;
      }
    });
    for (let i = flow.length - 1; i >= 0 && remaining !== 0; i -= 1) {
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
    else if (justify === "space-between" && flow.length > 1) {
      betweenGap = gap + leftover / (flow.length - 1);
    } else if (justify === "space-around" && flow.length > 0) {
      const around = leftover / flow.length;
      mainStart += Math.floor(around / 2);
      betweenGap = gap + around;
    }
  }

  const results: LayoutResult[] = new Array(children.length);
  let cursor = mainStart;
  flow.forEach((child, k) => {
    const childMain = mains[k]!;
    let childCross = horizontal ? sizes[k]!.height : sizes[k]!.width;

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

    results[flowIndices[k]!] = arrange(child, childBox);
    cursor += childMain + betweenGap;
  });

  // Absolute children: positioned by their insets, out of flow.
  children.forEach((child, i) => {
    if (isAbsolute(child)) results[i] = arrange(child, absoluteBox(child, inner));
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
