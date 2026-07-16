import { createElement as h, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { TreeMachine } from "@uniview/tui-core";
import type { Color, Dimension, FlatTreeRow, TreeSourceNode } from "@uniview/tui-core";
import type { TuiKeyEvent } from "./primitives";

export interface TreeNode<T = unknown> {
  id: string;
  label: string;
  data?: T;
  children?: readonly TreeNode<T>[];
}

/** Per-row context handed to a custom label renderer. */
export interface TreeRowMeta {
  depth: number;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
  /** The computed indent + guide prefix (`"│ ├─"`), so custom renderers keep guides. */
  prefix: string;
}

export interface TreeProps<T = unknown> {
  nodes: readonly TreeNode<T>[];
  /** Controlled selection (node id). */
  selectedId: string;
  onSelect: (id: string) => void;
  /** Controlled expansion (expanded node ids). */
  expandedIds: readonly string[];
  onExpandedChange: (ids: readonly string[]) => void;
  /** Custom label renderer; defaults to `prefix + chevron + label`. */
  renderLabel?: (node: TreeNode<T>, meta: TreeRowMeta) => ReactNode;
  /** Draw `│ ├─ └─` indent guides. Defaults to `true`. */
  guides?: boolean;
  /** Viewport height in rows. Defaults to the visible-row count (no scroll). */
  height?: number;
  width?: Dimension;
  /** Full-row highlight for the selected row. Defaults to `"blue"`. */
  selectedBackground?: Color;
  selectedColor?: Color;
}

/** The `│ / ├─ / └─` prefix for a row, or plain indentation when guides are off. */
export function guidePrefix(row: FlatTreeRow, guides: boolean): string {
  if (!guides) return "  ".repeat(row.depth);
  let out = "";
  for (const ancestorHasSibling of row.guides) out += ancestorHasSibling ? "│ " : "  ";
  if (row.depth > 0) out += row.last ? "└─" : "├─";
  return out;
}

/** `▸ `/`▾ ` for an expandable node, blank for a leaf (the guide connector abuts the label). */
export function chevron(row: FlatTreeRow): string {
  return row.expandable ? (row.expanded ? "▾ " : "▸ ") : "";
}

export function Tree<T = unknown>(props: TreeProps<T>): ReactElement {
  const guides = props.guides ?? true;
  const selectedBackground = props.selectedBackground ?? "blue";

  // Index nodes by id and derive the id-only source tree the machine flattens.
  const byId = new Map<string, TreeNode<T>>();
  const toSource = (list: readonly TreeNode<T>[]): TreeSourceNode[] =>
    list.map((n) => {
      byId.set(n.id, n);
      return { id: n.id, children: n.children ? toSource(n.children) : undefined };
    });
  const machine = new TreeMachine({
    roots: toSource(props.nodes),
    expanded: props.expandedIds,
    selectedId: props.selectedId,
  });
  const rows = machine.rows();

  const viewport = props.height ?? rows.length;
  const maxScroll = Math.max(0, rows.length - viewport);
  const [scrollTop, setScrollTop] = useState(0);
  const selectedIndex = machine.selectedIndex;

  // Keep the selected row visible — the same scroll rule as <List>.
  useEffect(() => {
    setScrollTop((s) => {
      if (selectedIndex < 0) return Math.min(s, maxScroll);
      if (selectedIndex < s) return selectedIndex;
      if (selectedIndex >= s + viewport) return selectedIndex - viewport + 1;
      return Math.min(s, maxScroll);
    });
  }, [selectedIndex, viewport, maxScroll]);

  const onKeyDown = (event: TuiKeyEvent): void => {
    for (const effect of machine.handle({ type: "key", ...event })) {
      if (effect.type === "select") props.onSelect(effect.id);
      else props.onExpandedChange(machine.expandedIds());
    }
  };

  const items: ReactNode[] = [];
  const end = Math.min(rows.length, scrollTop + viewport);
  for (let i = scrollTop; i < end; i += 1) {
    const row = rows[i]!;
    const node = byId.get(row.id)!;
    const selected = row.id === props.selectedId;
    const prefix = guidePrefix(row, guides);
    const meta: TreeRowMeta = { depth: row.depth, expandable: row.expandable, expanded: row.expanded, selected, prefix };
    const label = props.renderLabel
      ? props.renderLabel(node, meta)
      : h("text", { color: selected ? props.selectedColor : undefined }, `${prefix}${chevron(row)}${node.label}`);
    items.push(
      h(
        "box",
        {
          key: row.id,
          role: "treeitem",
          name: node.label,
          selected,
          width: "100%",
          backgroundColor: selected ? selectedBackground : undefined,
          onClick: () => props.onSelect(row.id),
        },
        label,
      ),
    );
  }

  return h("box", { role: "tree", onKeyDown, flexDirection: "column", height: viewport, width: props.width }, ...items);
}

export type DirectoryTreeProps<T = unknown> = Omit<TreeProps<T>, "renderLabel">;

/**
 * A filesystem-flavored preset over {@link Tree}: folders keep the `▸`/`▾`
 * chevron, files get a `·` bullet. Pure composition — no renderer branch, no
 * `variant`.
 */
export function DirectoryTree<T = unknown>(props: DirectoryTreeProps<T>): ReactElement {
  return h(Tree<T>, {
    ...props,
    renderLabel: (node, meta) => {
      const marker = meta.expandable ? (meta.expanded ? "▾ " : "▸ ") : "· ";
      return h("text", { color: meta.selected ? props.selectedColor : undefined }, `${meta.prefix}${marker}${node.label}`);
    },
  });
}
