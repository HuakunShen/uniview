import {
  CellBuffer,
  CellFlags,
  StyleTable,
  resolveColorCss,
  type CellStyle,
  type CellSurface,
  type FrameUpdate,
  type PresentStats,
  type Size,
} from "@uniview/tui-core";

export interface DomCellSurfaceOptions {
  styles?: StyleTable;
  /**
   * Batches a render callback. Defaults to `requestAnimationFrame` so updates
   * coalesce to the browser frame; tests inject a synchronous scheduler.
   */
  schedule?: (callback: () => void) => void;
}

interface Pending {
  frame: CellBuffer;
  update: FrameUpdate;
}

function defaultSchedule(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(callback);
  else callback();
}

function applyStyle(span: HTMLSpanElement, style: CellStyle): void {
  const fg = resolveColorCss(style.fg);
  const bg = resolveColorCss(style.bg);
  if (fg) span.style.color = fg;
  if (bg) span.style.backgroundColor = bg;
  if (style.bold) span.style.fontWeight = "bold";
  if (style.italic) span.style.fontStyle = "italic";
  if (style.underline) span.style.textDecoration = "underline";
}

/**
 * Renders a tui-core {@link CellBuffer} to the browser DOM as one `<div>` per
 * row containing `<span>` runs coalesced by style — the plan's wterm-style
 * exact TUI mirror. Only dirty rows are rebuilt, updates are batched to a
 * frame, and text is written via `textContent` (never HTML) so it is XSS-safe.
 */
export class DomCellSurface implements CellSurface {
  readonly kind = "dom" as const;

  private readonly styles: StyleTable;
  private readonly schedule: (callback: () => void) => void;
  private rows: HTMLDivElement[] = [];
  private pending: Pending | null = null;
  private scheduled = false;

  readonly debug = { lastUpdatedRows: [] as number[] };

  constructor(
    private readonly container: HTMLElement,
    options: DomCellSurfaceOptions = {},
  ) {
    this.styles = options.styles ?? new StyleTable();
    this.schedule = options.schedule ?? defaultSchedule;
  }

  mount(size: Size): void {
    this.container.replaceChildren();
    this.rows = Array.from({ length: size.height }, () => {
      const row = this.container.ownerDocument.createElement("div");
      row.className = "uv-term-row";
      this.container.append(row);
      return row;
    });
  }

  resize(size: Size): void {
    this.mount(size);
  }

  present(frame: CellBuffer, update: FrameUpdate): PresentStats {
    this.pending = { frame: frame.clone(), update };
    this.debug.lastUpdatedRows = [...update.dirtyRows];
    if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(() => this.flush());
    }
    return {
      rowsPainted: update.dirtyRows.length,
      runsPainted: update.changedRuns.length,
    };
  }

  private flush(): void {
    this.scheduled = false;
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    const { frame, update } = pending;
    const rowIndices = update.fullRepaint
      ? frame.graphemes.length === 0
        ? []
        : Array.from({ length: frame.height }, (_, y) => y)
      : update.dirtyRows;

    for (const y of rowIndices) {
      const row = this.rows[y];
      if (row) this.renderRow(row, frame, y);
    }
  }

  private renderRow(row: HTMLDivElement, frame: CellBuffer, y: number): void {
    const doc = this.container.ownerDocument;
    const spans: HTMLSpanElement[] = [];
    let current: HTMLSpanElement | null = null;
    let currentStyleId = -1;

    for (let x = 0; x < frame.width; x += 1) {
      const i = frame.index(x, y);
      if (frame.flags[i]! & CellFlags.Continuation) continue;
      const styleId = frame.styleIds[i]!;
      if (!current || styleId !== currentStyleId) {
        current = doc.createElement("span");
        applyStyle(current, this.styles.get(styleId));
        currentStyleId = styleId;
        current.textContent = "";
        spans.push(current);
      }
      current.textContent += frame.graphemes[i];
    }

    row.replaceChildren(...spans);
  }

  destroy(): void {
    this.container.replaceChildren();
    this.rows = [];
    this.pending = null;
  }
}
