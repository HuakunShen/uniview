import type {
  EventPropName,
  HandlerId,
  JSONValue,
  Mutation,
  UINode,
} from "@uniview/protocol";
import {
  CommittedOutput,
  hitTest,
  StyleTable,
  TuiRenderer,
  type CellSurface,
  type Size,
  type StyledLine,
} from "@uniview/tui-core";
import { extractHandlers, uinodeToRenderNode } from "./convert";
import { MutableTree } from "./mutable-tree";
import {
  buildSemanticTree,
  queryById,
  queryByRole,
  queryByText,
  type RoleQuery,
  type SemanticNode,
} from "./semantics";

export interface TuiHostOptions {
  surface: CellSurface;
  size: Size;
  styles?: StyleTable;
  /** Invoked when a node's event fires, with its handler id and payload. */
  onInvokeHandler?: (handlerId: HandlerId, payload?: JSONValue) => void;
  /** Injectable flush scheduler (deterministic tests). */
  schedule?: (flush: () => void) => void;
  /** Optional committed-output channel for <Static> (append-only scrollback). */
  committed?: CommittedOutput;
}

/**
 * A terminal host for the Uniview protocol. It consumes `setRoot` and mutation
 * batches into a {@link MutableTree}, converts the tree to a tui-core render
 * tree, drives a {@link TuiRenderer}, and dispatches input back to plugin
 * handlers by id — the plan's "TUI becomes a Uniview host".
 */
export class TuiHost {
  readonly renderer: TuiRenderer;

  private readonly tree = new MutableTree();
  private readonly onInvokeHandler: TuiHostOptions["onInvokeHandler"];
  private handlers = new Map<string, Partial<Record<EventPropName, HandlerId>>>();
  private readonly invocations: { id: HandlerId; payload?: JSONValue }[] = [];
  private readonly committed: CommittedOutput | undefined;
  private readonly staticCounts = new Map<string, number>();

  constructor(options: TuiHostOptions) {
    this.onInvokeHandler = options.onInvokeHandler;
    this.committed = options.committed;
    this.renderer = new TuiRenderer({
      surface: options.surface,
      size: options.size,
      styles: options.styles ?? new StyleTable(),
      schedule: options.schedule,
    });
  }

  /** Replace the whole tree and render. */
  setRoot(node: UINode | null): void {
    this.tree.apply({ type: "setRoot", node });
    this.render();
  }

  /** Apply a mutation batch and render. */
  applyBatch(mutations: readonly Mutation[]): void {
    this.tree.applyBatch(mutations);
    this.render();
  }

  /** Convert the current tree and paint a frame. */
  render(): void {
    const root = this.tree.getRoot();
    this.handlers = extractHandlers(root);
    this.flushStatic(root);
    this.renderer.setRoot(root ? uinodeToRenderNode(root) : null);
    this.renderer.flush();
  }

  /** Imperatively append finalized lines to the committed-output channel (direct mode). */
  commitStatic(lines: readonly StyledLine[]): void {
    this.committed?.commit(lines);
  }

  /**
   * Commit the `staticLines` of every `role="log"` node, deduped per node id —
   * only lines beyond that node's high-water mark are written, so appending
   * items re-commits only the new ones and a plain re-render writes nothing.
   */
  private flushStatic(root: UINode | null): void {
    const committed = this.committed;
    if (!committed || !root) return;
    const visit = (node: UINode): void => {
      const lines = node.props.staticLines;
      if (Array.isArray(lines)) {
        const already = this.staticCounts.get(node.id) ?? 0;
        if (lines.length > already) {
          const fresh: StyledLine[] = [];
          for (let i = already; i < lines.length; i += 1) {
            const value = lines[i];
            if (typeof value === "string") fresh.push([{ text: value }]);
          }
          committed.commit(fresh);
          this.staticCounts.set(node.id, lines.length);
        }
      }
      for (const child of node.children) {
        if (typeof child !== "string") visit(child);
      }
    };
    visit(root);
  }

  /** Node ids (in tree order) that have a handler for `event`. */
  eventTargets(event: EventPropName): string[] {
    const ids: string[] = [];
    for (const [id, map] of this.handlers) {
      if (map[event] !== undefined) ids.push(id);
    }
    return ids;
  }

  /** True when `nodeId`'s UINode carries `disabled: true`. */
  private isDisabled(nodeId: string): boolean {
    return this.tree.getNode(nodeId)?.props.disabled === true;
  }

  /**
   * Focusable nodes in tree order — those that can be clicked or that edit
   * text. `textbox` is true when the node accepts text input (has onChange).
   * Disabled nodes are excluded, matching how HTML `disabled` removes an
   * element from the tab order rather than merely styling it.
   */
  focusableTargets(): { id: string; textbox: boolean }[] {
    const targets: { id: string; textbox: boolean }[] = [];
    for (const [id, map] of this.handlers) {
      if (this.isDisabled(id)) continue;
      const textbox = map.onChange !== undefined;
      if (map.onClick !== undefined || map.onKeyDown !== undefined || textbox) {
        targets.push({ id, textbox });
      }
    }
    return targets;
  }

  /** The plugin node id owning the cell at `(x, y)`, or null. */
  nodeAt(x: number, y: number): string | null {
    const frame = this.renderer.currentFrame;
    if (!frame) return null;
    return hitTest(frame, this.renderer.owners, x, y);
  }

  /**
   * Fire an event on a node; returns whether a handler was invoked. A disabled
   * node never fires — this is the single choke point every input path
   * (click, key, automation) routes through, so gating here is what actually
   * makes `disabled` mean something rather than a prop `semantics.ts` reports
   * but nothing enforces.
   */
  fireEvent(nodeId: string, event: EventPropName, payload?: JSONValue): boolean {
    if (this.isDisabled(nodeId)) return false;
    const handlerId = this.handlers.get(nodeId)?.[event];
    if (handlerId === undefined) return false;
    this.invocations.push({ id: handlerId, payload });
    this.onInvokeHandler?.(handlerId, payload);
    return true;
  }

  /** The handler ids invoked so far (a command trace for automation). */
  commands(): readonly { id: HandlerId; payload?: JSONValue }[] {
    return this.invocations;
  }

  /** Clear the recorded command trace. */
  resetCommands(): void {
    this.invocations.length = 0;
  }

  /**
   * The nearest node at or above `startId` that has a handler for any of
   * `events` — used to resolve hover/wheel targets by bubbling from the node
   * under the pointer. Returns null when none is found.
   */
  nearestTarget(startId: string | null, events: readonly EventPropName[]): string | null {
    let id: string | undefined | null = startId;
    while (id) {
      const map = this.handlers.get(id);
      if (map && events.some((e) => map[e] !== undefined)) return id;
      id = this.tree.parentId(id);
    }
    return null;
  }

  /**
   * The nearest node at or above `startId` that can take focus. A pointer hit
   * usually lands on a leaf (the label inside a row), which is not focusable
   * itself — focusing it would be a silent no-op, leaving focus stranded on
   * whatever was focused before.
   */
  nearestFocusable(startId: string | null): string | null {
    const focusable = new Set(this.focusableTargets().map((t) => t.id));
    let id: string | undefined | null = startId;
    while (id) {
      if (focusable.has(id)) return id;
      id = this.tree.parentId(id);
    }
    return null;
  }

  /**
   * Fire an event starting at `startId` and bubbling up ancestors until a
   * handler runs (like DOM bubbling). Returns whether any handler was invoked.
   */
  fireEventBubbling(
    startId: string | null,
    event: EventPropName,
    payload?: JSONValue,
  ): boolean {
    let id: string | undefined | null = startId;
    while (id) {
      if (this.fireEvent(id, event, payload)) return true;
      id = this.tree.parentId(id);
    }
    return false;
  }

  // --- Semantic queries (automation / contract testing) --------------------

  /** The accessibility tree derived from the current UINode tree. */
  semanticTree(): SemanticNode | null {
    return buildSemanticTree(this.tree.getRoot());
  }

  queryByRole(role: string, query?: RoleQuery): SemanticNode | null {
    return queryByRole(this.semanticTree(), role, query);
  }

  queryByText(matcher: string | RegExp): SemanticNode | null {
    return queryByText(this.semanticTree(), matcher);
  }

  queryById(id: string): SemanticNode | null {
    return queryById(this.semanticTree(), id);
  }

  /**
   * Resolve a semantic target (by role+name or id) and activate it — the
   * automation `act` primitive that drives by semantics, not coordinates.
   * Returns whether a matching control's handler ran.
   */
  activate(
    target: { role: string; name?: string | RegExp } | { id: string },
  ): boolean {
    const node =
      "id" in target
        ? this.queryById(target.id)
        : this.queryByRole(target.role, { name: target.name });
    if (!node) return false;
    return this.fireEvent(node.id, "onClick");
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
