import { createElement, type ReactElement } from "react";
import {
  HandlerRegistry,
  MutationCollector,
  createRenderer,
  render as reactRender,
  serializeTree,
  unmount,
} from "@uniview/react-renderer";
import {
  AnsiCellSurface,
  FrameClock,
  MemoryCellSurface,
  StyleTable,
  SvgCellSurface,
  TerminalDriver,
  yogaLayoutEngine,
} from "@uniview/tui-core";
import { InputRouter, TuiHost } from "@uniview/host-tui";
import { TuiRuntimeContext } from "./input";
import { TuiClockContext } from "./animation";
import { connectReactDevTools } from "./devtools";
import type {
  CellSurface,
  CommittedOutput,
  LayoutEngine,
  Size,
  TuiInputEvent,
  TtyInput,
  TtyOutput,
} from "@uniview/tui-core";

export {
  AnsiCellSurface,
  FrameClock,
  MemoryCellSurface,
  StyleTable,
  SvgCellSurface,
  TerminalDriver,
  yogaLayoutEngine,
};
export type {
  CellSurface,
  CommittedOutput,
  LayoutEngine,
  Size,
  TuiInputEvent,
  TtyInput,
  TtyOutput,
} from "@uniview/tui-core";

export { VirtualList } from "./virtual-list";
export type { VirtualListProps } from "./virtual-list";
export { Select } from "./select";
export type { SelectProps } from "./select";
export { Panel } from "./panel";
export type { PanelProps } from "./panel";
export { List, listCounter } from "./list";
export type { ListProps } from "./list";
export { Tree, DirectoryTree } from "./tree";
export type { TreeProps, TreeNode, TreeRowMeta, DirectoryTreeProps } from "./tree";
export { Calendar, isoDate } from "./calendar";
export type { CalendarProps } from "./calendar";
export { StatusBar } from "./status-bar";
export type { StatusBarProps, StatusItem } from "./status-bar";
// First-class JSX components for the host primitives: <Box>/<Text>/<RichText>
export { Box, Text, RichText } from "./primitives";
export { Masked } from "./masked";
export type { MaskedProps } from "./masked";
export { Spacer, Newline, Transform } from "./layout-primitives";
export type { NewlineProps, TransformProps } from "./layout-primitives";
export { Static } from "./static";
export type { StaticProps } from "./static";
export { TextInput } from "./text-input";
export type { TextInputProps } from "./text-input";
export { Tabs } from "./tabs";
export type { TabsProps, TabItem } from "./tabs";
export { Table } from "./table";
export type { Column, TableProps, ColumnAlign, SortDirection, SortState } from "./table";
export { useInput, usePaste, TuiRuntimeContext } from "./input";
export { ErrorBoundary, ErrorOverview } from "./error-boundary";
export type { ErrorBoundaryProps, ErrorOverviewProps } from "./error-boundary";
export { connectReactDevTools } from "./devtools";
export type { DevToolsOptions } from "./devtools";
export type {
  BoxProps,
  TextProps,
  RichTextProps,
  TuiCommonProps,
  TuiEventHandlers,
  TuiKeyEvent,
  TuiWheelEvent,
  TuiPointerEvent,
} from "./primitives";

export { ScrollView, Scrollbar, Hoverable, CommandPalette, filterCommands, clampScroll } from "./interactive";
export type {
  ScrollViewProps,
  ScrollbarProps,
  HoverableProps,
  CommandPaletteProps,
  Command,
} from "./interactive";
export { Markdown, StreamingMarkdown, Code, Diff, renderNodeToElement } from "./content";
export type {
  MarkdownProps,
  StreamingMarkdownProps,
  CodeProps,
  DiffProps,
} from "./content";
export { nextFocus, useFocusList } from "./focus";
export { useAnimation, animate, TuiClockContext, TuiClockProvider } from "./animation";
export type { AnimationState, AnimateOptions } from "./animation";

export { BarChart, Histogram, Sparkline, Gauge, LineGauge, LineChart, Scatter } from "./charts";
export { Canvas } from "./canvas";
export type { CanvasProps } from "./canvas";
export { Image } from "./image";
export type { ImageProps } from "./image";
export type {
  BarChartProps,
  HistogramProps,
  SparklineProps,
  GaugeProps,
  LineGaugeProps,
  LineChartProps,
  ScatterProps,
} from "./charts";

export interface TuiReactRootOptions {
  surface: CellSurface;
  size: Size;
  styles?: StyleTable;
  /** Optional committed-output channel backing <Static> (append-only scrollback). */
  committed?: CommittedOutput;
  /** When true, connect React DevTools (dynamically imported behind the flag). */
  devtools?: boolean;
  /** Frame driver for useAnimation/animate. Defaults to a performance.now()-paced clock. */
  clock?: FrameClock;
  /** Layout engine; defaults to the zero-dependency customLayoutEngine. Pass `yogaLayoutEngine` to opt in. */
  layoutEngine?: LayoutEngine;
  /**
   * "full" (default) re-serializes the tree each commit; "incremental" feeds
   * React's mutation batches to the host (the protocol's incremental path).
   */
  mode?: "full" | "incremental";
}

export interface TuiReactRoot {
  /** The underlying terminal host. */
  readonly host: TuiHost;
  /** The frame driver backing useAnimation/animate. */
  readonly clock: FrameClock;
  /** Mount (or replace) the React element. */
  render(element: ReactElement): void;
  /** Route a normalized terminal input event to the React tree. */
  dispatchInput(event: TuiInputEvent): void;
  /** Unmount React and tear down the host. */
  destroy(): void;
}

export interface TuiReactRenderOptions extends Omit<
  TuiReactRootOptions,
  "surface" | "size" | "styles"
> {
  width?: number;
  height?: number;
  input?: TtyInput;
  output?: TtyOutput;
}

export interface TuiReactApp extends TuiReactRoot {
  readonly driver: TerminalDriver;
}

/**
 * Render a React plugin to a terminal {@link CellSurface}. React commits are
 * serialized to UINode and fed to a {@link TuiHost}; an {@link InputRouter}
 * routes input back — click/Enter/Space activate buttons and typing edits the
 * focused text field (firing onChange/onSubmit). React state updates flow
 * through as incremental frames. This is the plan's React "direct mode".
 */
export function createTuiReactRoot(options: TuiReactRootOptions): TuiReactRoot {
  const handle = createRenderer();
  const registry = new HandlerRegistry();

  const host = new TuiHost({
    surface: options.surface,
    size: options.size,
    styles: options.styles,
    committed: options.committed,
    layoutEngine: options.layoutEngine,
    onInvokeHandler: (handlerId, payload) => {
      void registry.execute(handlerId, payload);
    },
  });
  const router = new InputRouter(host);

  const clock =
    options.clock ??
    new FrameClock({
      now: () => performance.now(),
      requestFrame: (frame) => {
        setTimeout(frame, 16);
      },
      diagnostics: host.renderer.diagnostics,
    });

  if (options.devtools) void connectReactDevTools({ enabled: true });

  const syncFull = (): void => {
    const tree = handle.rootInstance
      ? serializeTree(handle.rootInstance, registry)
      : null;
    // A root is always an element (never a bare string) in practice.
    host.setRoot(typeof tree === "string" ? null : tree);
    router.onRender();
  };

  let unsubscribe: () => void;
  if (options.mode === "incremental") {
    handle.mutationCollector = new MutationCollector(registry);
    unsubscribe = handle.subscribeMutations((mutations) => {
      host.applyBatch(mutations);
      router.onRender();
    });
  } else {
    unsubscribe = handle.subscribe(syncFull);
  }
  let destroyed = false;

  return {
    host,
    clock,

    render(element: ReactElement): void {
      if (destroyed) {
        throw new Error("Cannot render into a destroyed TUI React root");
      }
      // React (ConcurrentRoot) commits asynchronously; `sync` runs from the
      // bridge subscription on every commit, painting each frame. The Providers
      // render no host node, so `serializeTree(rootInstance)` is unchanged.
      reactRender(
        createElement(
          TuiClockContext.Provider,
          { value: clock },
          createElement(TuiRuntimeContext.Provider, { value: router }, element),
        ),
        handle,
      );
    },

    dispatchInput(event: TuiInputEvent): void {
      router.dispatch(event);
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      unmount(handle);
      registry.clear();
      host.destroy();
    },
  };
}

export function render(
  element: ReactElement,
  options: TuiReactRenderOptions = {},
): TuiReactApp {
  const input = options.input ?? (process.stdin as unknown as TtyInput);
  const output = options.output ?? (process.stdout as unknown as TtyOutput);
  const styles = new StyleTable();
  const root = createTuiReactRoot({
    surface: new AnsiCellSurface({
      write: (chunk) => output.write(chunk),
      styles,
    }),
    styles,
    size: {
      width: options.width ?? output.columns ?? 80,
      height: options.height ?? output.rows ?? 24,
    },
    committed: options.committed,
    devtools: options.devtools,
    clock: options.clock,
    layoutEngine: options.layoutEngine,
    mode: options.mode,
  });
  const driver = new TerminalDriver({
    input,
    output,
    onEvent: (event) => {
      if (event.type === "resize") {
        root.host.renderer.resize({ width: event.width, height: event.height });
      } else {
        root.dispatchInput(event);
      }
    },
  });

  driver.start();
  root.render(element);

  return {
    host: root.host,
    clock: root.clock,
    driver,
    render: (next) => root.render(next),
    dispatchInput: (event) => root.dispatchInput(event),
    destroy: () => {
      try {
        root.destroy();
      } finally {
        driver.stop();
      }
    },
  };
}
