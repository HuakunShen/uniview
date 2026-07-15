import type { CellBuffer } from "../buffer/cell-buffer";
import type { OwnerTable } from "../paint/owner-table";

/**
 * Resolve the node id at a pointer cell. Because children paint over their
 * parents, the cell's owner is already the topmost node — no traversal needed.
 * Returns null for out-of-bounds or unowned cells.
 */
export function hitTest(
  buffer: CellBuffer,
  owners: OwnerTable,
  x: number,
  y: number,
): string | null {
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return null;
  const ownerId = buffer.ownerIds[buffer.index(x, y)]!;
  return owners.idOf(ownerId) ?? null;
}
