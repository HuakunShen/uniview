import { CellBuffer } from "../buffer/cell-buffer";
import type { CursorState } from "../buffer/frame";
import type { TuiInputEvent } from "../input/events";
import { renderToBuffer, type RenderNode } from "../paint/paint";
import { customLayoutEngine, type LayoutEngine } from "../layout/engine";
import { OwnerTable } from "../paint/owner-table";
import { DiagnosticsTracker } from "../scheduler/diagnostics";
import { RenderScheduler, type RenderKind } from "../scheduler/scheduler";
import {
  DEFAULT_MAX_CLIPBOARD_BYTES,
  extractSelectedText,
  TextSelectionController,
  type SelectionInputResult,
  type SelectionRange,
  type TextSelectionOptions,
} from "../selection/text-selection";
import { StyleTable } from "../style/style-table";
import { buildFrameUpdate, HIDDEN_CURSOR } from "../surface/frame-update";
import type { CellSurface, Size } from "../surface/types";

export type { RenderNode } from "../paint/paint";

export interface TuiRendererOptions {
  /** Where frames are presented (Memory/ANSI/DOM/SVG). */
  surface: CellSurface;
  /** Initial terminal size in cells. */
  size: Size;
  /** Shared style table; the surface must resolve ids against the same one. */
  styles?: StyleTable;
  /** Cursor state to present. Defaults to hidden. */
  cursor?: CursorState;
  /** Injectable flush scheduler for deterministic tests. */
  schedule?: (flush: () => void) => void;
  /** Layout engine; defaults to the zero-dependency customLayoutEngine. */
  layoutEngine?: LayoutEngine;
  /** Optional application-level visible text selection. */
  selection?: TextSelectionOptions;
}

type TuiRendererLifecycle = "active" | "destroying" | "destroyed";
type SurfaceOperation = "mount" | "resize" | "present" | "destroy";

function isThenable(value: unknown): boolean {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return false;
  }
  return typeof (value as { readonly then?: unknown }).then === "function";
}

/**
 * The render loop that ties the core together: it owns a scene root, a double
 * buffer, a scheduler and diagnostics, and drives a {@link CellSurface}. A
 * mutation invalidates the scheduler; the coalesced flush lays out and paints
 * the scene, diffs it against the last frame, and presents only the changes.
 */
export class TuiRenderer {
  readonly diagnostics = new DiagnosticsTracker();

  private readonly surface: CellSurface;
  private readonly styles: StyleTable;
  private readonly layoutEngine: LayoutEngine;
  private readonly scheduler: RenderScheduler;
  private readonly selectionOptions: TextSelectionOptions | undefined;
  private readonly selection = new TextSelectionController();
  private size: Size;
  private cursor: CursorState;

  private root: RenderNode | null = null;
  private previous: CellBuffer | null = null;
  private forceFullRepaint = false;
  private revision = 0;
  private lifecycle: TuiRendererLifecycle = "active";
  private destroyCallInProgress = false;

  /** Owner table for the most recently rendered frame (hit-testing source). */
  owners = new OwnerTable();

  /** The most recently rendered frame buffer, or null before the first frame. */
  get currentFrame(): CellBuffer | null {
    return this.previous;
  }

  get selectionRange(): SelectionRange | null {
    return this.selection.range;
  }

  /** Whether public mutation and presentation operations may still run. */
  get isActive(): boolean {
    return this.lifecycle === "active";
  }

  constructor(options: TuiRendererOptions) {
    this.surface = options.surface;
    this.styles = options.styles ?? new StyleTable();
    this.layoutEngine = options.layoutEngine ?? customLayoutEngine;
    this.selectionOptions = options.selection;
    this.size = options.size;
    this.cursor = options.cursor ?? HIDDEN_CURSOR;
    this.scheduler = new RenderScheduler({
      render: (kind) => this.renderFrame(kind),
      schedule: options.schedule,
    });
    const mountResult = this.surface.mount(this.size);
    this.assertSynchronousSurfaceResult("mount", mountResult);
  }

  /** Replace the scene root and schedule a render. */
  setRoot(root: RenderNode | null): void {
    this.assertActive("set a root");
    this.root = root;
    this.invalidate("layout");
  }

  /** Change the terminal size; the next frame is a full repaint. */
  resize(size: Size): void {
    this.assertActive("resize");
    const resizeResult = this.surface.resize(size);
    this.assertSynchronousSurfaceResult("resize", resizeResult);
    if (!this.isActive) return;
    this.size = size;
    this.forceFullRepaint = true;
    this.invalidate("layout");
  }

  /** Set the presented cursor state and schedule a render. */
  setCursor(cursor: CursorState): void {
    this.assertActive("set the cursor");
    this.cursor = cursor;
    this.invalidate("paint");
  }

  /** Flush any pending frame immediately (test/synchronous convenience). */
  flush(): void {
    this.assertActive("flush");
    this.scheduler.flushSync();
  }

  handleSelectionInput(event: TuiInputEvent): SelectionInputResult {
    this.assertActive("dispatch selection input");
    if (!this.selectionOptions) {
      return { consumed: false, changed: false };
    }

    const result = this.selection.handle(event, this.previous);
    let completed = result.completed;
    if (completed) {
      const maxBytes =
        this.selectionOptions.maxClipboardBytes ?? DEFAULT_MAX_CLIPBOARD_BYTES;
      const clipboardEmitted =
        this.selectionOptions.clipboard === "on-select" &&
        completed.byteCount <= maxBytes &&
        (this.selectionOptions.writeClipboard?.(completed.text, maxBytes) ??
          false);
      completed = { ...completed, clipboardEmitted };
      this.selectionOptions.onSelection?.(completed);
    }
    if (result.changed) this.invalidate("paint");
    return completed ? { ...result, completed } : result;
  }

  destroy(): void {
    if (this.lifecycle === "destroyed" || this.destroyCallInProgress) return;
    this.beginTeardown();
    this.destroyCallInProgress = true;
    try {
      const destroyResult = this.surface.destroy();
      this.assertSynchronousSurfaceResult("destroy", destroyResult);
      this.lifecycle = "destroyed";
    } finally {
      this.destroyCallInProgress = false;
    }
  }

  private assertActive(action: string): void {
    if (this.lifecycle !== "active") {
      throw new Error(
        `Cannot ${action} after TUI renderer teardown has started`,
      );
    }
  }

  private beginTeardown(): void {
    if (this.lifecycle !== "active") return;
    this.lifecycle = "destroying";
    this.scheduler.cancel();
    this.diagnostics.discardPendingRenderWork();
    this.root = null;
    this.previous = null;
    this.selection.clear();
    this.owners = new OwnerTable();
  }

  private assertSynchronousSurfaceResult(
    operation: SurfaceOperation,
    result: unknown,
  ): void {
    let thenable: boolean;
    try {
      thenable = isThenable(result);
    } catch (error) {
      this.beginTeardown();
      throw error;
    }
    if (!thenable) return;
    this.beginTeardown();
    throw new TypeError(
      `CellSurface.${operation}() must complete synchronously; Promise and thenable results are not supported`,
    );
  }

  private invalidate(kind: RenderKind): void {
    this.diagnostics.bumpMutation();
    this.scheduler.invalidate(kind);
    this.diagnostics.setSchedulerPending(this.scheduler.pending);
  }

  private renderFrame(_kind: RenderKind): void {
    if (this.lifecycle !== "active") return;
    const root: RenderNode = this.root ?? { type: "box" };
    const { buffer, owners } = renderToBuffer(
      root,
      this.size,
      this.styles,
      this.layoutEngine,
    );
    this.applySelection(buffer);
    this.revision += 1;
    const previous = this.forceFullRepaint ? null : this.previous;
    const update = buildFrameUpdate(
      previous,
      buffer,
      this.revision,
      this.cursor,
    );
    this.forceFullRepaint = false;

    const presentResult = this.surface.present(buffer, update);
    this.assertSynchronousSurfaceResult("present", presentResult);
    if (this.lifecycle !== "active") return;

    this.owners = owners;
    this.previous = buffer;
    this.diagnostics.markRendered();
    this.diagnostics.setSchedulerPending(this.scheduler.pending);
  }

  private applySelection(buffer: CellBuffer): void {
    const range = this.selection.range;
    if (!range) return;
    if (extractSelectedText(buffer, range).length === 0) {
      this.selection.clear();
      return;
    }

    const firstY = Math.max(0, range.start.y);
    const lastY = Math.min(buffer.height - 1, range.end.y);
    const overlay = this.selectionOptions?.style ?? { inverse: true };
    for (let y = firstY; y <= lastY; y += 1) {
      const firstX = y === range.start.y ? Math.max(0, range.start.x) : 0;
      const lastX =
        y === range.end.y
          ? Math.min(buffer.width - 1, range.end.x)
          : buffer.width - 1;
      for (let x = firstX; x <= lastX; x += 1) {
        const index = buffer.index(x, y);
        if (buffer.selectable[index] !== 1) continue;
        buffer.styleIds[index] = this.styles.intern({
          ...this.styles.get(buffer.styleIds[index]!),
          ...overlay,
        });
      }
    }
  }
}
