import { CellBuffer } from "../buffer/cell-buffer";
import type { CursorState } from "../buffer/frame";
import { renderToBuffer, type RenderNode } from "../paint/paint";
import { customLayoutEngine, type LayoutEngine } from "../layout/engine";
import { OwnerTable } from "../paint/owner-table";
import { DiagnosticsTracker } from "../scheduler/diagnostics";
import { RenderScheduler, type RenderKind } from "../scheduler/scheduler";
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
}

type TuiRendererLifecycle = "active" | "destroying" | "destroyed";

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
  private size: Size;
  private cursor: CursorState;

  private root: RenderNode | null = null;
  private previous: CellBuffer | null = null;
  private forceFullRepaint = false;
  private revision = 0;
  private lifecycle: TuiRendererLifecycle = "active";

  /** Owner table for the most recently rendered frame (hit-testing source). */
  owners = new OwnerTable();

  /** The most recently rendered frame buffer, or null before the first frame. */
  get currentFrame(): CellBuffer | null {
    return this.previous;
  }

  constructor(options: TuiRendererOptions) {
    this.surface = options.surface;
    this.styles = options.styles ?? new StyleTable();
    this.layoutEngine = options.layoutEngine ?? customLayoutEngine;
    this.size = options.size;
    this.cursor = options.cursor ?? HIDDEN_CURSOR;
    this.scheduler = new RenderScheduler({
      render: (kind) => this.renderFrame(kind),
      schedule: options.schedule,
    });
    this.surface.mount(this.size);
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
    this.size = size;
    this.forceFullRepaint = true;
    void this.surface.resize(size);
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

  destroy(): void {
    if (this.lifecycle === "destroyed") return;
    if (this.lifecycle === "active") {
      this.lifecycle = "destroying";
      this.scheduler.cancel();
      this.diagnostics.setSchedulerPending(false);
      this.root = null;
      this.previous = null;
      this.owners = new OwnerTable();
    }
    this.surface.destroy();
    this.lifecycle = "destroyed";
  }

  private assertActive(action: string): void {
    if (this.lifecycle !== "active") {
      throw new Error(
        `Cannot ${action} after TUI renderer teardown has started`,
      );
    }
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
    this.owners = owners;

    this.revision += 1;
    const previous = this.forceFullRepaint ? null : this.previous;
    const update = buildFrameUpdate(
      previous,
      buffer,
      this.revision,
      this.cursor,
    );
    this.forceFullRepaint = false;

    void this.surface.present(buffer, update);

    this.previous = buffer;
    this.diagnostics.markRendered();
    this.diagnostics.setSchedulerPending(this.scheduler.pending);
  }
}
