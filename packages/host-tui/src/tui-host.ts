import type {
  EventPropName,
  HandlerId,
  JSONValue,
  Mutation,
  UINode,
} from "@uniview/protocol";
import {
  hitTest,
  StyleTable,
  TuiRenderer,
  type CellSurface,
  type Size,
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

  constructor(options: TuiHostOptions) {
    this.onInvokeHandler = options.onInvokeHandler;
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
    this.renderer.setRoot(root ? uinodeToRenderNode(root) : null);
    this.renderer.flush();
  }

  /** Node ids (in tree order) that have a handler for `event`. */
  eventTargets(event: EventPropName): string[] {
    const ids: string[] = [];
    for (const [id, map] of this.handlers) {
      if (map[event] !== undefined) ids.push(id);
    }
    return ids;
  }

  /** The plugin node id owning the cell at `(x, y)`, or null. */
  nodeAt(x: number, y: number): string | null {
    const frame = this.renderer.currentFrame;
    if (!frame) return null;
    return hitTest(frame, this.renderer.owners, x, y);
  }

  /** Fire an event on a node; returns whether a handler was invoked. */
  fireEvent(nodeId: string, event: EventPropName, payload?: JSONValue): boolean {
    const handlerId = this.handlers.get(nodeId)?.[event];
    if (handlerId === undefined) return false;
    this.onInvokeHandler?.(handlerId, payload);
    return true;
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

  destroy(): void {
    this.renderer.destroy();
  }
}
