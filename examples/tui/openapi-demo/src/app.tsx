import { createElement as h, useMemo, useState, type ReactElement } from "react";
import { keyEvent, TreeMachine, type Color, type TreeSourceNode } from "@uniview/tui-core";
import { Box, List, Panel, StatusBar, Text, Tree, listCounter, useInput } from "@uniview/tui-react";
import {
  listOperations,
  listTags,
  operationSchemaForest,
  type OpenApiSpec,
  type Operation,
  type SchemaTreeNode,
} from "./openapi";

export interface AppHost {
  quit: () => void;
}

const METHOD_COLORS: Record<string, Color> = {
  get: "green",
  post: "yellow",
  put: "cyan",
  patch: "cyan",
  delete: "red",
};

/** Project SchemaTreeNode[] to the id-only source tree the TreeMachine flattens. */
function toSource(nodes: readonly SchemaTreeNode[]): TreeSourceNode[] {
  return nodes.map((n) => ({ id: n.id, children: n.children ? toSource(n.children) : undefined }));
}

/** Every node id in a forest (used to expand-all on first view of an operation). */
function allIds(nodes: readonly SchemaTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly SchemaTreeNode[]): void => {
    for (const n of list) {
      out.push(n.id);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

interface SchemaState {
  selectedId: string;
  expandedIds: string[];
}

/** Initial schema view for an operation: everything expanded, first root selected. */
function initSchemaState(forest: readonly SchemaTreeNode[]): SchemaState {
  return { selectedId: forest[0]?.id ?? "", expandedIds: allIds(forest) };
}

/**
 * A browse-only OpenAPI explorer — a multi-pane app over a bundled spec.
 * Operations list (left) + operation details and a collapsible JSON-Schema tree
 * with `$ref` drill-down (right). Focus is app-owned and cycles with Tab (the
 * lazygit accordion model); the focused pane draws a green border. Modelled on
 * ratatui `openapi-tui`, browse-only (no live requests).
 *
 *   Tab: switch pane · ↑/↓: move · →/←: expand/collapse · f: filter tag · q: quit
 */
export function App({
  spec,
  cols,
  rows,
  host,
}: {
  spec: OpenApiSpec;
  cols: number;
  rows: number;
  host: AppHost;
}): ReactElement {
  const tags = useMemo(() => listTags(spec), [spec]);
  const allOps = useMemo(() => listOperations(spec), [spec]);

  const [tagIndex, setTagIndex] = useState(0); // 0 = all
  const activeTag = tagIndex === 0 ? null : tags[tagIndex - 1]!;
  const ops = useMemo(
    () => (activeTag ? allOps.filter((o) => (o.tags ?? []).includes(activeTag)) : allOps),
    [allOps, activeTag],
  );

  const [opIndex, setOpIndex] = useState(0);
  const [pane, setPane] = useState<0 | 1>(0);
  const op: Operation | undefined = ops[Math.min(opIndex, ops.length - 1)];
  const forest = useMemo(() => (op ? operationSchemaForest(spec, op) : []), [spec, op]);
  const [schema, setSchema] = useState<SchemaState>(() => initSchemaState(forest));

  const selectOp = (next: number): void => {
    const clamped = Math.max(0, Math.min(ops.length - 1, next));
    setOpIndex(clamped);
    const nextOp = ops[clamped];
    setSchema(initSchemaState(nextOp ? operationSchemaForest(spec, nextOp) : []));
  };

  const cycleTag = (): void => {
    const nextTag = (tagIndex + 1) % (tags.length + 1);
    setTagIndex(nextTag);
    const filter = nextTag === 0 ? null : tags[nextTag - 1]!;
    const nextOps = filter ? allOps.filter((o) => (o.tags ?? []).includes(filter)) : allOps;
    setOpIndex(0);
    setSchema(initSchemaState(nextOps[0] ? operationSchemaForest(spec, nextOps[0]) : []));
  };

  // Drive the schema tree by replaying the key through a fresh TreeMachine
  // (exactly how the <Tree> component drives itself), then lifting its effects
  // back into controlled state.
  const driveSchema = (key: string): void => {
    const machine = new TreeMachine({ roots: toSource(forest), expanded: schema.expandedIds, selectedId: schema.selectedId });
    let next = schema;
    for (const effect of machine.handle(keyEvent(key))) {
      if (effect.type === "select") next = { ...next, selectedId: effect.id };
      else next = { ...next, expandedIds: machine.expandedIds() };
    }
    if (next !== schema) setSchema(next);
  };

  useInput((input, k) => {
    if (input === "q") host.quit();
    else if (input === "f") cycleTag();
    else if (k.tab) setPane((p) => (p === 0 ? 1 : 0));
    else if (pane === 0) {
      if (k.upArrow) selectOp(opIndex - 1);
      else if (k.downArrow) selectOp(opIndex + 1);
      else if (k.rightArrow) setPane(1);
    } else {
      if (k.upArrow) driveSchema("ArrowUp");
      else if (k.downArrow) driveSchema("ArrowDown");
      else if (k.rightArrow) driveSchema("ArrowRight");
      else if (k.leftArrow) driveSchema("ArrowLeft");
      else if (k.return) driveSchema("ArrowRight");
    }
  });

  const leftWidth = Math.max(28, Math.min(46, Math.floor(cols * 0.4)));
  const bodyHeight = Math.max(6, rows - 2);
  const detailLines = op ? renderDetail(op) : ["No operation."];
  const detailHeight = Math.min(detailLines.length + 2, Math.max(5, Math.floor(bodyHeight / 2)));

  const tagLabel = activeTag ?? "all";

  return h(
    Box,
    { flexDirection: "column", width: "100%", height: "100%" },
    h(
      Box,
      { flexDirection: "row", flexGrow: 1 },
      // Left: operations list.
      h(
        Panel,
        {
          title: `Operations · ${tagLabel}`,
          focused: pane === 0,
          footer: ops.length ? listCounter(opIndex, ops.length) : "0",
          footerAlign: "right",
          width: leftWidth,
          height: bodyHeight,
        },
        h(List<Operation>, {
          items: ops,
          selectedIndex: opIndex,
          onSelect: selectOp,
          height: bodyHeight - 2,
          width: "100%",
          renderItem: (item: Operation) =>
            h(
              Box,
              { flexDirection: "row" },
              h(Text, { bold: true, color: METHOD_COLORS[item.method] ?? "white" }, `${item.method.toUpperCase().padEnd(6)} `),
              h(Text, null, item.path),
            ),
        }),
      ),
      // Right: details (top) + schema tree (bottom).
      h(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        h(
          Panel,
          { title: op ? `${op.method.toUpperCase()} ${op.path}` : "Details", height: detailHeight },
          h(
            Box,
            { flexDirection: "column" },
            ...detailLines.map((line, i) => h(Text, { key: i, color: i === 0 ? undefined : "gray" }, line)),
          ),
        ),
        h(
          Panel,
          { title: "Schema", footer: "$ref drill-down", footerAlign: "right", focused: pane === 1, flexGrow: 1 },
          h(Tree<unknown>, {
            nodes: forest,
            selectedId: schema.selectedId,
            expandedIds: schema.expandedIds,
            onSelect: (id: string) => setSchema((s) => ({ ...s, selectedId: id })),
            onExpandedChange: (ids: readonly string[]) => setSchema((s) => ({ ...s, expandedIds: [...ids] })),
            height: Math.max(3, bodyHeight - detailHeight - 2),
            width: "100%",
          }),
        ),
      ),
    ),
    h(StatusBar, {
      height: 1,
      items: [
        { label: "switch pane", keyHint: "Tab" },
        { label: "move", keyHint: "↑↓" },
        { label: "expand", keyHint: "→←" },
        { label: "filter tag", keyHint: "f" },
        { label: "quit", keyHint: "q" },
      ],
    }),
  );
}

/** The details-panel text lines for an operation: summary, then parameters. */
function renderDetail(op: Operation): string[] {
  const lines: string[] = [];
  lines.push(op.summary ?? op.operationId ?? `${op.method} ${op.path}`);
  const params = op.parameters ?? [];
  if (params.length) {
    lines.push("parameters:");
    for (const p of params) {
      const type = p.schema?.type === "array" ? `array<${p.schema.items?.type ?? "any"}>` : p.schema?.type ?? "any";
      const req = p.required ? "*" : "";
      lines.push(`  ${p.name}${req} (${p.in}) ${type}${p.description ? ` — ${p.description}` : ""}`);
    }
  }
  if (op.requestBody) lines.push(`requestBody${op.requestBody.required ? "*" : ""}: ${op.requestBody.description ?? "body"}`);
  return lines;
}
