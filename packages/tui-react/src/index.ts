import { createElement, type ReactElement } from "react";
import {
  HandlerRegistry,
  MutationCollector,
  createRenderer,
  render as reactRender,
  serializeTree,
  unmount,
} from "@uniview/react-renderer";
import { InputRouter, TuiHost } from "@uniview/host-tui";
import { TuiRuntimeContext } from "./input";
import { connectReactDevTools } from "./devtools";
import type {
  CellSurface,
  CommittedOutput,
  Size,
  StyleTable,
  TuiInputEvent,
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

export { BarChart, Histogram, Sparkline, Gauge, LineGauge, LineChart, Scatter } from "./charts";
export { Canvas } from "./canvas";
export type { CanvasProps } from "./canvas";
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
  /**
   * "full" (default) re-serializes the tree each commit; "incremental" feeds
   * React's mutation batches to the host (the protocol's incremental path).
   */
  mode?: "full" | "incremental";
}

export interface TuiReactRoot {
  /** The underlying terminal host. */
  readonly host: TuiHost;
  /** Mount (or replace) the React element. */
  render(element: ReactElement): void;
  /** Route a normalized terminal input event to the React tree. */
  dispatchInput(event: TuiInputEvent): void;
  /** Unmount React and tear down the host. */
  destroy(): void;
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
    onInvokeHandler: (handlerId, payload) => {
      void registry.execute(handlerId, payload);
    },
  });
  const router = new InputRouter(host);

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

  return {
    host,

    render(element: ReactElement): void {
      // React (ConcurrentRoot) commits asynchronously; `sync` runs from the
      // bridge subscription on every commit, painting each frame. The Provider
      // renders no host node, so `serializeTree(rootInstance)` is unchanged.
      reactRender(createElement(TuiRuntimeContext.Provider, { value: router }, element), handle);
    },

    dispatchInput(event: TuiInputEvent): void {
      router.dispatch(event);
    },

    destroy(): void {
      unsubscribe();
      unmount(handle);
      host.destroy();
    },
  };
}
