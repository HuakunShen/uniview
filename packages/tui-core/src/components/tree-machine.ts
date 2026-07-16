import type { TuiInputEvent } from "../input/events";

/**
 * A node in the caller's source tree. Only identity + children matter here;
 * labels and payload live in the framework wrapper.
 */
export interface TreeSourceNode {
  /** Stable id, unique across the whole tree. */
  id: string;
  children?: readonly TreeSourceNode[];
}

/** One visible row after flattening the tree at the current expansion state. */
export interface FlatTreeRow {
  id: string;
  /** 0 for roots, +1 per level. */
  depth: number;
  /** true when the node has children (can expand). */
  expandable: boolean;
  /** true when an expandable node is currently open. */
  expanded: boolean;
  /** true when this node is the last of its siblings (draws `└`, else `├`). */
  last: boolean;
  /**
   * One flag per ancestor level: does that ancestor have a *later* sibling?
   * Drives the vertical indent guides (`│` vs blank). Length === depth.
   */
  guides: readonly boolean[];
}

/** Serializable transitions emitted by {@link TreeMachine.handle}. */
export type TreeEffect =
  | { type: "select"; id: string; index: number }
  | { type: "expand"; id: string }
  | { type: "collapse"; id: string };

export interface TreeInit {
  roots: readonly TreeSourceNode[];
  /** Initially/controlled expanded ids. */
  expanded?: Iterable<string>;
  /** Selected id; defaults to the first visible row. */
  selectedId?: string;
}

/**
 * Framework-neutral expansion + roving-cursor state for a tree view. It flattens
 * the source tree at the current expansion into visible rows (with indent-guide
 * metadata) and turns key events into serializable effects — the same behavior
 * for direct, Worker, and WebSocket hosts, mirroring {@link TabsMachine} /
 * {@link TextInputMachine}.
 */
export class TreeMachine {
  private readonly roots: readonly TreeSourceNode[];
  private readonly expanded: Set<string>;
  private selected: string | undefined;

  constructor(init: TreeInit) {
    this.roots = init.roots;
    this.expanded = new Set(init.expanded ?? []);
    this.selected = init.selectedId ?? this.rows()[0]?.id;
  }

  get selectedId(): string | undefined {
    return this.selected;
  }

  get selectedIndex(): number {
    return this.rows().findIndex((r) => r.id === this.selected);
  }

  isExpanded(id: string): boolean {
    return this.expanded.has(id);
  }

  /** Currently-expanded ids (for translating effects back to controlled props). */
  expandedIds(): string[] {
    return [...this.expanded];
  }

  setSelected(id: string): void {
    this.selected = id;
  }

  setExpanded(id: string, on: boolean): void {
    if (on) this.expanded.add(id);
    else this.expanded.delete(id);
  }

  /** DFS flatten, skipping the subtree under any collapsed node. */
  rows(): FlatTreeRow[] {
    const out: FlatTreeRow[] = [];
    const walk = (nodes: readonly TreeSourceNode[], depth: number, guides: boolean[]): void => {
      nodes.forEach((node, i) => {
        const last = i === nodes.length - 1;
        const expandable = (node.children?.length ?? 0) > 0;
        const expanded = expandable && this.expanded.has(node.id);
        out.push({ id: node.id, depth, expandable, expanded, last, guides: [...guides] });
        if (expanded) walk(node.children!, depth + 1, [...guides, !last]);
      });
    };
    walk(this.roots, 0, []);
    return out;
  }

  private selectAt(rows: FlatTreeRow[], index: number): TreeEffect[] {
    const row = rows[index];
    if (!row || row.id === this.selected) return [];
    this.selected = row.id;
    return [{ type: "select", id: row.id, index }];
  }

  handle(event: TuiInputEvent): TreeEffect[] {
    if (event.type !== "key") return [];
    const rows = this.rows();
    if (rows.length === 0) return [];
    const index = Math.max(
      0,
      rows.findIndex((r) => r.id === this.selected),
    );
    const row = rows[index]!;

    switch (event.key) {
      case "ArrowDown":
        return this.selectAt(rows, Math.min(index + 1, rows.length - 1));
      case "ArrowUp":
        return this.selectAt(rows, Math.max(index - 1, 0));
      case "Home":
        return this.selectAt(rows, 0);
      case "End":
        return this.selectAt(rows, rows.length - 1);
      case "ArrowRight":
        if (row.expandable && !row.expanded) {
          this.expanded.add(row.id);
          return [{ type: "expand", id: row.id }];
        }
        // Already open (or a leaf): step onto the next visible row.
        return this.selectAt(rows, Math.min(index + 1, rows.length - 1));
      case "ArrowLeft":
        if (row.expandable && row.expanded) {
          this.expanded.delete(row.id);
          return [{ type: "collapse", id: row.id }];
        }
        // Collapsed node or leaf: jump to the nearest shallower row above (parent).
        for (let i = index - 1; i >= 0; i -= 1) {
          if (rows[i]!.depth < row.depth) return this.selectAt(rows, i);
        }
        return [];
      default:
        return [];
    }
  }
}
