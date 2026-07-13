import { CellBuffer } from "../buffer/cell-buffer";
import {
  computeLayout,
  type LayoutInput,
  type LayoutResult,
} from "../layout/layout";
import { StyleTable, type CellStyle, type Color } from "../style/style-table";
import { stringCellWidth } from "../text/graphemes";
import type { TuiStyle } from "../style/tui-style";
import type { Size } from "../surface/types";
import { borderGlyphs } from "./border";
import { OwnerTable } from "./owner-table";

/**
 * A node in the render tree: layout style plus paintable content. Text nodes
 * carry `text` (and no children); box nodes carry `children`.
 */
export interface RenderNode {
  id?: string;
  type?: string;
  style?: TuiStyle;
  text?: string;
  /** Style applied to `text` glyphs. */
  textStyle?: CellStyle;
  /** Fill color for the node's box region. */
  background?: Color;
  /** Style (e.g. color) applied to border glyphs. */
  borderStyle?: CellStyle;
  children?: RenderNode[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderOutput {
  buffer: CellBuffer;
  owners: OwnerTable;
}

function isTextLeaf(node: RenderNode): boolean {
  return node.text !== undefined && (node.children?.length ?? 0) === 0;
}

/** Build the layout mirror of a render tree, measuring text leaves. */
function toLayoutInput(node: RenderNode): LayoutInput {
  if (isTextLeaf(node)) {
    const text = node.text ?? "";
    const width = stringCellWidth(text);
    return {
      id: node.id,
      style: node.style,
      measure: () => ({ width, height: 1 }),
    };
  }
  return {
    id: node.id,
    style: node.style,
    children: (node.children ?? []).map(toLayoutInput),
  };
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function fillRect(
  buffer: CellBuffer,
  rect: Rect,
  styleId: number,
  ownerId: number,
): void {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  for (let y = rect.y; y < bottom; y += 1) {
    for (let x = rect.x; x < right; x += 1) {
      buffer.writeText(x, y, " ", styleId, ownerId, undefined, x + 1);
    }
  }
}

function drawBorder(
  buffer: CellBuffer,
  box: Rect,
  clip: Rect,
  glyphs: ReturnType<typeof borderGlyphs>,
  styleId: number,
  ownerId: number,
): void {
  if (!glyphs || box.width < 1 || box.height < 1) return;
  const left = box.x;
  const right = box.x + box.width - 1;
  const top = box.y;
  const bottom = box.y + box.height - 1;

  const put = (x: number, y: number, g: string) => {
    if (x < clip.x || x >= clip.x + clip.width) return;
    if (y < clip.y || y >= clip.y + clip.height) return;
    buffer.writeText(x, y, g, styleId, ownerId, undefined, x + 1);
  };

  for (let x = left; x <= right; x += 1) {
    put(x, top, glyphs.horizontal);
    put(x, bottom, glyphs.horizontal);
  }
  for (let y = top; y <= bottom; y += 1) {
    put(left, y, glyphs.vertical);
    put(right, y, glyphs.vertical);
  }
  put(left, top, glyphs.topLeft);
  put(right, top, glyphs.topRight);
  put(left, bottom, glyphs.bottomLeft);
  put(right, bottom, glyphs.bottomRight);
}

function paintNode(
  node: RenderNode,
  layout: LayoutResult,
  buffer: CellBuffer,
  styles: StyleTable,
  owners: OwnerTable,
  clip: Rect,
): void {
  const box = layout.box;
  const boxClip = intersect(clip, box);
  if (boxClip.width <= 0 || boxClip.height <= 0) return;

  const ownerId = node.id ? owners.intern(node.id) : 0;

  if (node.background !== undefined) {
    fillRect(buffer, boxClip, styles.intern({ bg: node.background }), ownerId);
  }

  const glyphs = borderGlyphs(node.style?.border);
  if (glyphs) {
    drawBorder(buffer, box, boxClip, glyphs, styles.intern(node.borderStyle ?? {}), ownerId);
  }

  if (isTextLeaf(node)) {
    const styleId = styles.intern(node.textStyle ?? {});
    if (box.y >= boxClip.y && box.y < boxClip.y + boxClip.height) {
      buffer.writeText(
        box.x,
        box.y,
        node.text ?? "",
        styleId,
        ownerId,
        undefined,
        boxClip.x + boxClip.width,
      );
    }
    return;
  }

  const children = node.children ?? [];
  children.forEach((child, i) => {
    const childLayout = layout.children[i];
    if (childLayout) paintNode(child, childLayout, buffer, styles, owners, boxClip);
  });
}

/**
 * Full render pipeline: lay out `root` in `size`, paint it into a fresh
 * {@link CellBuffer}, and return the buffer plus its {@link OwnerTable}.
 */
export function renderToBuffer(
  root: RenderNode,
  size: Size,
  styles: StyleTable = new StyleTable(),
): RenderOutput {
  const layout = computeLayout(toLayoutInput(root), size);
  const buffer = new CellBuffer(size.width, size.height);
  const owners = new OwnerTable();
  paintNode(root, layout, buffer, styles, owners, {
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
  });
  return { buffer, owners };
}
