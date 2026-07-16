import { createEffect, createMemo, createSignal, For, type JSX } from "solid-js";
import { TreeMachine } from "@uniview/tui-core";
import type { Color, Dimension, FlatTreeRow, TreeSourceNode, TuiKeyEvent } from "@uniview/tui-core";
import { Text } from "./primitives";

export interface TreeNode<T = unknown> {
  id: string;
  label: string;
  data?: T;
  children?: readonly TreeNode<T>[];
}

export interface TreeRowMeta {
  depth: number;
  expandable: boolean;
  expanded: boolean;
  selected: boolean;
  prefix: string;
}

export interface TreeProps<T = unknown> {
  nodes: readonly TreeNode<T>[];
  selectedId: string;
  onSelect: (id: string) => void;
  expandedIds: readonly string[];
  onExpandedChange: (ids: readonly string[]) => void;
  renderLabel?: (node: TreeNode<T>, meta: TreeRowMeta) => JSX.Element;
  guides?: boolean;
  height?: number;
  width?: Dimension;
  selectedBackground?: Color;
  selectedColor?: Color;
}

/** Identical to the tui-react copy — kept local so Solid never imports React at runtime. */
export function guidePrefix(row: FlatTreeRow, guides: boolean): string {
  if (!guides) return "  ".repeat(row.depth);
  let out = "";
  for (const ancestorHasSibling of row.guides) out += ancestorHasSibling ? "│ " : "  ";
  if (row.depth > 0) out += row.last ? "└─" : "├─";
  return out;
}

export function chevron(row: FlatTreeRow): string {
  return row.expandable ? (row.expanded ? "▾ " : "▸ ") : "";
}

export function Tree<T = unknown>(props: TreeProps<T>): JSX.Element {
  const guides = (): boolean => props.guides ?? true;

  const model = createMemo(() => {
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
    return { byId, machine, rows: machine.rows() };
  });

  const viewport = (): number => props.height ?? model().rows.length;
  const [scrollTop, setScrollTop] = createSignal(0);

  createEffect(() => {
    const { machine, rows } = model();
    const index = machine.selectedIndex;
    const view = viewport();
    const max = Math.max(0, rows.length - view);
    setScrollTop((top) => {
      if (index < 0) return Math.min(top, max);
      if (index < top) return index;
      if (index >= top + view) return index - view + 1;
      return Math.min(top, max);
    });
  });

  const onKeyDown = (event: TuiKeyEvent): void => {
    const { machine } = model();
    for (const effect of machine.handle({ type: "key", ...event })) {
      if (effect.type === "select") props.onSelect(effect.id);
      else props.onExpandedChange(machine.expandedIds());
    }
  };

  const visible = (): FlatTreeRow[] => {
    const rows = model().rows;
    const start = scrollTop();
    return rows.slice(start, Math.min(rows.length, start + viewport()));
  };

  return (
    <box role="tree" onKeyDown={onKeyDown} flexDirection="column" height={viewport()} width={props.width}>
      <For each={visible()}>
        {(row) => {
          const node = model().byId.get(row.id)!;
          const selected = (): boolean => row.id === props.selectedId;
          const prefix = guidePrefix(row, guides());
          return (
            <box
              role="treeitem"
              name={node.label}
              selected={selected()}
              width="100%"
              backgroundColor={selected() ? (props.selectedBackground ?? "blue") : undefined}
              onClick={() => props.onSelect(row.id)}
            >
              {props.renderLabel ? (
                props.renderLabel(node, {
                  depth: row.depth,
                  expandable: row.expandable,
                  expanded: row.expanded,
                  selected: selected(),
                  prefix,
                })
              ) : (
                <Text color={selected() ? props.selectedColor : undefined}>{`${prefix}${chevron(row)}${node.label}`}</Text>
              )}
            </box>
          );
        }}
      </For>
    </box>
  );
}

export type DirectoryTreeProps<T = unknown> = Omit<TreeProps<T>, "renderLabel">;

export function DirectoryTree<T = unknown>(props: DirectoryTreeProps<T>): JSX.Element {
  return (
    <Tree
      {...props}
      renderLabel={(node, meta) => {
        const marker = meta.expandable ? (meta.expanded ? "▾ " : "▸ ") : "· ";
        return <Text color={meta.selected ? props.selectedColor : undefined}>{`${meta.prefix}${marker}${node.label}`}</Text>;
      }}
    />
  );
}
