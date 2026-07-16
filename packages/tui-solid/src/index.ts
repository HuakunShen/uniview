import { createRoot } from "solid-js";
import {
  createComponent,
  HandlerRegistry,
  getRootNode,
  render as solidRender,
  resetIdCounter,
  serializeTree,
  setRootNode,
  setUpdateCallback,
  type SolidNode,
} from "@uniview/solid-renderer";
import { InputRouter, TuiHost } from "@uniview/host-tui";
import { TuiRuntimeContext } from "./input";
import { connectSolidDevTools } from "./devtools";
import type {
  CellSurface,
  CommittedOutput,
  Size,
  StyleTable,
  TuiInputEvent,
} from "@uniview/tui-core";

export { BarChart, Gauge, Histogram, LineChart, LineGauge, Scatter, Sparkline } from "./charts";
export type {
  BarChartProps,
  GaugeProps,
  HistogramProps,
  LineChartProps,
  LineGaugeProps,
  ScatterProps,
  SparklineProps,
} from "./charts";
export { Code, Diff, Markdown, renderNodeToElement, StreamingMarkdown } from "./content";
export type {
  CodeProps,
  DiffProps,
  MarkdownProps,
  StreamingMarkdownProps,
} from "./content";
export { createFocusList, nextFocus } from "./focus";
export type { FocusList } from "./focus";
export {
  clampScroll,
  CommandPalette,
  filterCommands,
  Hoverable,
  Scrollbar,
  ScrollView,
} from "./interactive";
export type {
  Command,
  CommandPaletteProps,
  HoverableProps,
  ScrollbarProps,
  ScrollViewProps,
} from "./interactive";
export { List, listCounter } from "./list";
export type { ListProps } from "./list";
export { Select } from "./select";
export type { SelectProps } from "./select";
export { VirtualList } from "./virtual-list";
export type { VirtualListProps } from "./virtual-list";
export { Panel } from "./panel";
export type { PanelProps } from "./panel";
export { Box, RichText, Text } from "./primitives";
export type {
  BoxProps,
  RichTextProps,
  TextProps,
  TuiCommonProps,
} from "./primitives";
export { Masked } from "./masked";
export type { MaskedProps } from "./masked";
export { Spacer, Newline, Transform } from "./layout-primitives";
export type { NewlineProps, TransformProps } from "./layout-primitives";
export { Static } from "./static";
export type { StaticProps } from "./static";
export { TextInput } from "./text-input";
export type { TextInputProps } from "./text-input";
export { useInput, usePaste, TuiRuntimeContext } from "./input";
export { TuiErrorBoundary, ErrorOverview } from "./error-boundary";
export type { TuiErrorBoundaryProps, ErrorOverviewProps } from "./error-boundary";
export { connectSolidDevTools } from "./devtools";
export type { DevToolsOptions } from "./devtools";
export { StatusBar } from "./status-bar";
export type { StatusBarProps, StatusItem } from "./status-bar";

export interface TuiSolidRootOptions {
  surface: CellSurface;
  size: Size;
  styles?: StyleTable;
  /** Optional committed-output channel backing <Static> (append-only scrollback). */
  committed?: CommittedOutput;
  /** When true, connect Solid DevTools (dynamically imported behind the flag). */
  devtools?: boolean;
}

export interface TuiSolidRoot {
  /** The underlying terminal host. */
  readonly host: TuiHost;
  /** Mount a Solid root component. */
  render(App: () => unknown): void;
  /** Route a normalized terminal input event to the Solid tree. */
  dispatchInput(event: TuiInputEvent): void;
  /** Dispose the Solid root and tear down the host. */
  destroy(): void;
}

/**
 * Render a Solid plugin to a terminal {@link CellSurface}. Solid's fine-grained
 * reactivity commits synchronously; each update serializes to UINode and feeds
 * a {@link TuiHost}, and input routes back exactly as in the React adapter.
 * Together with @uniview/tui-react this proves the framework-agnostic host.
 *
 * Note: solid-renderer uses a single module-global root, so one Solid root may
 * be active per process at a time.
 */
export function createTuiSolidRoot(options: TuiSolidRootOptions): TuiSolidRoot {
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

  if (options.devtools) void connectSolidDevTools({ enabled: true });

  const sync = (): void => {
    const container = getRootNode();
    const appRoot = container?.children[0] ?? null;
    const tree = appRoot ? serializeTree(appRoot, registry) : null;
    host.setRoot(tree && typeof tree !== "string" ? tree : null);
    router.onRender();
  };

  setUpdateCallback(sync);

  let dispose: (() => void) | null = null;

  return {
    host,

    render(App: () => unknown): void {
      resetIdCounter();
      const container: SolidNode = {
        _type: "element",
        id: "__root",
        type: "div",
        props: {},
        children: [],
        parent: null,
      };
      setRootNode(container);
      dispose = createRoot((disposeRoot) => {
        solidRender(
          () =>
            createComponent(TuiRuntimeContext.Provider, {
              value: router,
              get children() {
                return App() as SolidNode;
              },
            }) as SolidNode,
          container,
        );
        return disposeRoot;
      });
      sync();
    },

    dispatchInput(event: TuiInputEvent): void {
      router.dispatch(event);
    },

    destroy(): void {
      dispose?.();
      dispose = null;
      setUpdateCallback(() => {});
      host.destroy();
    },
  };
}
