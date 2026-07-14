import { createElement, useState, type ReactElement, type ReactNode } from "react";
import type { RenderNode } from "@uniview/tui-core";
import { renderNodeToElement } from "./content";

// --- ScrollView -------------------------------------------------------------

export interface ScrollViewProps {
  /** A column {@link RenderNode} whose children are 1-row-high nodes. */
  content: RenderNode;
  /** Viewport height in rows. */
  height: number;
  /** Total width in cells (the scrollbar takes the last column). */
  width?: number;
  /** Show the scrollbar (default true). */
  scrollbar?: boolean;
  /** Controlled scroll offset (rows). When set with onScrollChange, the parent owns scroll. */
  scrollTop?: number;
  /** Controlled-mode callback: report a requested new scroll offset (already clamped). */
  onScrollChange?: (scrollTop: number) => void;
}

/** Clamp a scroll offset to the valid range for a row count and viewport height. */
export function clampScroll(scrollTop: number, rowCount: number, height: number): number {
  return Math.max(0, Math.min(Math.max(0, rowCount - height), scrollTop));
}

function scrollbarColumn(rowCount: number, height: number, scrollTop: number): ReactElement {
  const maxScroll = Math.max(0, rowCount - height);
  const thumb = rowCount <= height ? height : Math.max(1, Math.round((height * height) / rowCount));
  const start = maxScroll <= 0 ? 0 : Math.round((scrollTop / maxScroll) * (height - thumb));
  const cells = Array.from({ length: height }, (_, i) => {
    const on = i >= start && i < start + thumb;
    return createElement(
      "text",
      { key: i, color: on ? "white" : "gray", dim: !on },
      on ? "█" : "│",
    );
  });
  return createElement("box", { flexDirection: "column", width: 1 }, ...cells);
}

/**
 * A scrollable viewport over a column of 1-row nodes. Scrolls with the mouse
 * wheel (routed by position) and, when focused, the keyboard (arrows / j·k /
 * PageUp·PageDown / Home·End). Renders a scrollbar in the last column.
 */
export function ScrollView({
  content,
  height,
  width,
  scrollbar = true,
  scrollTop: controlledTop,
  onScrollChange,
}: ScrollViewProps): ReactElement {
  const rows = content.children ?? [];
  const maxScroll = Math.max(0, rows.length - height);
  const controlled = onScrollChange !== undefined;
  const [internalTop, setInternalTop] = useState(0);
  const clamped = clampScroll(controlled ? (controlledTop ?? 0) : internalTop, rows.length, height);
  const visible = rows.slice(clamped, clamped + height);

  const scrollTo = (top: number): void => {
    const next = clampScroll(top, rows.length, height);
    if (controlled) onScrollChange?.(next);
    else setInternalTop(next);
  };
  const scrollBy = (delta: number): void => scrollTo(clamped + delta);

  const onKeyDown = (e: { key: string }): void => {
    switch (e.key) {
      case "ArrowDown":
      case "j":
        scrollBy(1);
        break;
      case "ArrowUp":
      case "k":
        scrollBy(-1);
        break;
      case "PageDown":
        scrollBy(height);
        break;
      case "PageUp":
        scrollBy(-height);
        break;
      case "Home":
        scrollTo(0);
        break;
      case "End":
        scrollTo(maxScroll);
        break;
    }
  };
  const onWheel = (e: { deltaY?: number }): void => scrollBy((e?.deltaY ?? 0) * 3);

  const contentWidth = width !== undefined ? width - (scrollbar ? 1 : 0) : undefined;
  const column = createElement(
    "box",
    { flexDirection: "column", width: contentWidth, height },
    ...visible.map((row, i) => renderNodeToElement(row, i)),
  );

  return createElement(
    "box",
    { flexDirection: "row", height, width, onKeyDown, onWheel },
    column,
    scrollbar ? scrollbarColumn(rows.length, height, clamped) : null,
  );
}

// --- Hoverable --------------------------------------------------------------

export interface HoverableProps {
  /** Render children given the current hover state. */
  children: (hovered: boolean) => ReactNode;
  onClick?: () => void;
}

/**
 * Wraps content with pointer-hover state (Claude-Code-style highlight-on-hover).
 * Fires onMouseEnter/onMouseLeave (routed by the host) and exposes `hovered` to
 * a render-prop child so it can restyle.
 */
export function Hoverable({ children, onClick }: HoverableProps): ReactElement {
  const [hovered, setHovered] = useState(false);
  return createElement(
    "box",
    {
      onClick,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
    children(hovered),
  );
}

// --- Command palette --------------------------------------------------------

export interface Command {
  id: string;
  label: string;
  hint?: string;
}

/** Case-insensitive subsequence filter over command labels (fuzzy-ish). */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.toLowerCase();
  if (q.length === 0) return [...commands];
  return commands.filter((c) => {
    const label = c.label.toLowerCase();
    let i = 0;
    for (const ch of q) {
      i = label.indexOf(ch, i);
      if (i < 0) return false;
      i += 1;
    }
    return true;
  });
}

export interface CommandPaletteProps {
  items: readonly Command[];
  /** Current filter text. */
  query: string;
  /** Index into the *filtered* list. */
  selectedIndex: number;
  onSelect: (id: string) => void;
  /** Called when an item is hovered (index into the filtered list). */
  onHover?: (index: number) => void;
  /** Overlay geometry (absolute) — defaults to a centered-ish dialog. */
  top?: number;
  left?: number;
  width?: number;
}

/**
 * A command-palette dialog rendered as an absolute overlay (paints on top of
 * the page). Presentational + controlled: the parent owns query/selection and
 * feeds keyboard; this renders the filtered list with the selection and hover
 * highlighted, and fires onSelect when an item is clicked.
 */
export function CommandPalette({
  items,
  query,
  selectedIndex,
  onSelect,
  onHover,
  top = 2,
  left = 4,
  width = 40,
}: CommandPaletteProps): ReactElement {
  const filtered = filterCommands(items, query);
  const header = createElement(
    "box",
    { key: "h", padding: { left: 1, right: 1 } },
    createElement("text", { color: "cyan", bold: true }, "› "),
    createElement("text", null, query.length > 0 ? query : "type to filter…"),
  );
  const rows = filtered.map((cmd, i) => {
    const active = i === selectedIndex;
    return createElement(
      "box",
      {
        key: cmd.id,
        onClick: () => onSelect(cmd.id),
        onMouseEnter: onHover ? () => onHover(i) : undefined,
        backgroundColor: active ? "blue" : undefined,
        padding: { left: 1, right: 1 },
        justifyContent: "space-between",
        flexDirection: "row",
      },
      createElement("text", { color: active ? "white" : undefined, bold: active }, cmd.label),
      cmd.hint ? createElement("text", { color: "gray", dim: true }, cmd.hint) : null,
    );
  });

  return createElement(
    "box",
    {
      position: "absolute",
      top,
      left,
      width,
      zIndex: 100,
      border: "rounded",
      backgroundColor: "black",
      flexDirection: "column",
    },
    header,
    ...rows,
  );
}
