import { CellFlags, type CellBuffer } from "../buffer/cell-buffer";

export interface CellPoint {
  x: number;
  y: number;
}

export interface SelectionRange {
  start: CellPoint;
  end: CellPoint;
}

export function normalizeSelectionRange(
  start: CellPoint,
  end: CellPoint,
): SelectionRange {
  const startBeforeEnd =
    start.y < end.y || (start.y === end.y && start.x <= end.x);
  return startBeforeEnd
    ? { start: { ...start }, end: { ...end } }
    : { start: { ...end }, end: { ...start } };
}

export function isSelectableCell(
  buffer: CellBuffer,
  point: CellPoint,
): boolean {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= buffer.width ||
    point.y >= buffer.height
  ) {
    return false;
  }
  return buffer.selectable[buffer.index(point.x, point.y)] === 1;
}

export function extractSelectedText(
  buffer: CellBuffer,
  range: SelectionRange,
): string {
  if (buffer.width === 0 || buffer.height === 0) return "";

  const normalized = normalizeSelectionRange(range.start, range.end);
  const firstY = Math.max(0, normalized.start.y);
  const lastY = Math.min(buffer.height - 1, normalized.end.y);
  if (firstY > lastY) return "";

  const rows: string[] = [];
  for (let y = firstY; y <= lastY; y += 1) {
    const firstX =
      y === normalized.start.y ? Math.max(0, normalized.start.x) : 0;
    const lastX =
      y === normalized.end.y
        ? Math.min(buffer.width - 1, normalized.end.x)
        : buffer.width - 1;
    let row = "";
    let hasSelectableCell = false;

    for (let x = firstX; x <= lastX; x += 1) {
      const index = buffer.index(x, y);
      if (buffer.selectable[index] !== 1) continue;
      hasSelectableCell = true;
      if (buffer.flags[index]! & CellFlags.Continuation) continue;
      row += buffer.graphemes[index]!;
    }

    if (hasSelectableCell) rows.push(row);
  }

  return rows.join("\n");
}
