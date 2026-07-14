import { createMemo, createSignal, For, Index, Show, type Accessor, type JSX } from "solid-js";
import { clampScroll, filterCommands } from "@uniview/tui-core";
import type { RenderNode } from "@uniview/tui-core";
import { renderNodeToElement } from "./content";
import { Text } from "./primitives";

// `clampScroll` and `filterCommands` are pure, framework-agnostic helpers that
// live in `@uniview/tui-core`; re-exported here so tui-solid's public API
// matches tui-react's.
export { clampScroll, filterCommands };

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

function Scrollbar(props: { rowCount: number; height: number; scrollTop: number }): JSX.Element {
  const thumb = createMemo(() =>
    props.rowCount <= props.height
      ? props.height
      : Math.max(1, Math.round((props.height * props.height) / props.rowCount)),
  );
  const start = createMemo(() => {
    const maxScroll = Math.max(0, props.rowCount - props.height);
    return maxScroll <= 0 ? 0 : Math.round((props.scrollTop / maxScroll) * (props.height - thumb()));
  });
  return (
    <box flexDirection="column" width={1}>
      <Index each={Array.from({ length: props.height })}>
        {(_, i) => {
          const on = createMemo(() => i >= start() && i < start() + thumb());
          return (
            <Text color={on() ? "white" : "gray"} dim={!on()}>
              {on() ? "█" : "│"}
            </Text>
          );
        }}
      </Index>
    </box>
  );
}

/**
 * A scrollable viewport over a column of 1-row nodes. Scrolls with the mouse
 * wheel (routed by position) and, when focused, the keyboard (arrows / j·k /
 * PageUp·PageDown / Home·End). Renders a scrollbar in the last column.
 */
export function ScrollView(props: ScrollViewProps): JSX.Element {
  const rows = createMemo(() => props.content.children ?? []);
  const maxScroll = createMemo(() => Math.max(0, rows().length - props.height));
  const controlled = (): boolean => props.onScrollChange !== undefined;

  const [internalTop, setInternalTop] = createSignal(0);
  const clamped = createMemo(() =>
    clampScroll(controlled() ? (props.scrollTop ?? 0) : internalTop(), rows().length, props.height),
  );
  const visible = createMemo(() => rows().slice(clamped(), clamped() + props.height));

  const scrollTo = (top: number): void => {
    const next = clampScroll(top, rows().length, props.height);
    if (controlled()) props.onScrollChange?.(next);
    else setInternalTop(next);
  };
  const scrollBy = (delta: number): void => scrollTo(clamped() + delta);

  const onKeyDown = (event: { key: string }): void => {
    switch (event.key) {
      case "ArrowDown":
      case "j":
        scrollBy(1);
        break;
      case "ArrowUp":
      case "k":
        scrollBy(-1);
        break;
      case "PageDown":
        scrollBy(props.height);
        break;
      case "PageUp":
        scrollBy(-props.height);
        break;
      case "Home":
        scrollTo(0);
        break;
      case "End":
        scrollTo(maxScroll());
        break;
    }
  };
  const onWheel = (event: { deltaY?: number }): void => scrollBy((event?.deltaY ?? 0) * 3);

  const showScrollbar = (): boolean => props.scrollbar ?? true;
  const contentWidth = createMemo(() =>
    props.width !== undefined ? props.width - (showScrollbar() ? 1 : 0) : undefined,
  );

  return (
    <box flexDirection="row" height={props.height} width={props.width} onKeyDown={onKeyDown} onWheel={onWheel}>
      <box flexDirection="column" width={contentWidth()} height={props.height}>
        <For each={visible()}>{(row) => renderNodeToElement(row)}</For>
      </box>
      <Show when={showScrollbar()}>
        <Scrollbar rowCount={rows().length} height={props.height} scrollTop={clamped()} />
      </Show>
    </box>
  );
}

// --- Hoverable --------------------------------------------------------------

export interface HoverableProps {
  /**
   * Render children given the current hover state. The state is passed as an
   * accessor, not a plain boolean: a boolean would be read once when the child
   * is created and could never change.
   */
  children: (hovered: Accessor<boolean>) => JSX.Element;
  onClick?: () => void;
}

/**
 * Wraps content with pointer-hover state (Claude-Code-style highlight-on-hover).
 * Fires onMouseEnter/onMouseLeave (routed by the host) and exposes `hovered` to
 * a render-prop child so it can restyle.
 */
export function Hoverable(props: HoverableProps): JSX.Element {
  const [hovered, setHovered] = createSignal(false);
  return (
    <box
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {props.children(hovered)}
    </box>
  );
}

// --- Command palette --------------------------------------------------------

export interface Command {
  id: string;
  label: string;
  hint?: string;
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
export function CommandPalette(props: CommandPaletteProps): JSX.Element {
  const filtered = createMemo(() => filterCommands(props.items, props.query));
  return (
    <box
      position="absolute"
      top={props.top ?? 2}
      left={props.left ?? 4}
      width={props.width ?? 40}
      zIndex={100}
      border="rounded"
      backgroundColor="black"
      flexDirection="column"
    >
      <box padding={{ left: 1, right: 1 }}>
        <Text color="cyan" bold>
          {"› "}
        </Text>
        <Text>{props.query.length > 0 ? props.query : "type to filter…"}</Text>
      </box>
      <For each={filtered()}>
        {(cmd, i) => {
          const active = createMemo(() => i() === props.selectedIndex);
          return (
            <box
              onClick={() => props.onSelect(cmd.id)}
              onMouseEnter={props.onHover ? () => props.onHover?.(i()) : undefined}
              backgroundColor={active() ? "blue" : undefined}
              padding={{ left: 1, right: 1 }}
              justifyContent="space-between"
              flexDirection="row"
            >
              <Text color={active() ? "white" : undefined} bold={active()}>
                {cmd.label}
              </Text>
              <Show when={cmd.hint !== undefined}>
                <Text color="gray" dim>
                  {cmd.hint}
                </Text>
              </Show>
            </box>
          );
        }}
      </For>
    </box>
  );
}
