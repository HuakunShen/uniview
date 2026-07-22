import "./jsx-runtime";
import {
  createComponent,
  HandlerRegistry,
  getRootNode,
  render as solidRender,
  resetIdCounter,
  serializeTree,
  setRootNode,
  setMutationCollector,
  setMutationUpdateCallback,
  setUpdateCallback,
  type SolidNode,
} from "@uniview/solid-renderer";
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
import { connectSolidDevTools } from "./devtools";
import { setActiveTuiClock } from "./animation";
import type {
  CellSurface,
  CommittedOutput,
  LayoutEngine,
  Size,
  TuiInputEvent,
  TtyInput,
  TtyOutput,
} from "@uniview/tui-core";

let activeSolidRootOwner: object | null = null;

function reserveSolidRootOwnership(owner: object): void {
  if (activeSolidRootOwner && activeSolidRootOwner !== owner) {
    throw new Error(
      "Cannot render because another TUI Solid root is active; destroy it before rendering this root",
    );
  }
  activeSolidRootOwner = owner;
}

function releaseSolidRootOwnership(owner: object): void {
  if (activeSolidRootOwner === owner) activeSolidRootOwner = null;
}

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

export {
  BarChart,
  Gauge,
  Histogram,
  LineChart,
  LineGauge,
  Scatter,
  Sparkline,
} from "./charts";
export { Canvas } from "./canvas";
export type { CanvasProps } from "./canvas";
export { Image } from "./image";
export type { ImageProps } from "./image";
export type {
  BarChartProps,
  GaugeProps,
  HistogramProps,
  LineChartProps,
  LineGaugeProps,
  ScatterProps,
  SparklineProps,
} from "./charts";
export {
  Code,
  Diff,
  Markdown,
  renderNodeToElement,
  StreamingMarkdown,
} from "./content";
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
export { Tree, DirectoryTree } from "./tree";
export type {
  TreeProps,
  TreeNode,
  TreeRowMeta,
  DirectoryTreeProps,
} from "./tree";
export { Calendar, isoDate } from "./calendar";
export type { CalendarProps } from "./calendar";
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
export { Tabs } from "./tabs";
export type { TabsProps, TabItem } from "./tabs";
export { Table } from "./table";
export type {
  Column,
  TableProps,
  ColumnAlign,
  SortDirection,
  SortState,
} from "./table";
export { useInput, usePaste, TuiRuntimeContext } from "./input";
export { TuiErrorBoundary, ErrorOverview } from "./error-boundary";
export type {
  TuiErrorBoundaryProps,
  ErrorOverviewProps,
} from "./error-boundary";
export { connectSolidDevTools } from "./devtools";
export type { DevToolsOptions } from "./devtools";
export {
  useAnimation,
  animate,
  getActiveTuiClock,
  setActiveTuiClock,
} from "./animation";
export type { AnimationState, AnimateOptions } from "./animation";
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
  /** Frame driver for useAnimation/animate. Defaults to a performance.now()-paced clock. */
  clock?: FrameClock;
  /** Layout engine; defaults to the zero-dependency customLayoutEngine. Pass `yogaLayoutEngine` to opt in. */
  layoutEngine?: LayoutEngine;
}

export interface TuiSolidRoot {
  /** The underlying terminal host. */
  readonly host: TuiHost;
  /** The frame driver backing useAnimation/animate. */
  readonly clock: FrameClock;
  /** Mount a Solid root component. */
  render(App: () => unknown): void;
  /** Route a normalized terminal input event to the Solid tree. */
  dispatchInput(event: TuiInputEvent): void;
  /** Dispose the Solid root and tear down the host. */
  destroy(): void;
}

export interface TuiSolidRenderOptions extends Omit<
  TuiSolidRootOptions,
  "surface" | "size" | "styles"
> {
  width?: number;
  height?: number;
  input?: TtyInput;
  output?: TtyOutput;
}

export interface TuiSolidApp extends TuiSolidRoot {
  readonly driver: TerminalDriver;
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
function createTuiSolidRootInternal(
  options: TuiSolidRootOptions,
  owner: object,
): TuiSolidRoot {
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

  if (options.devtools) void connectSolidDevTools({ enabled: true });

  const ownsGlobals = (): boolean => activeSolidRootOwner === owner;

  const sync = (): void => {
    const container = getRootNode();
    const appRoot = container?.children[0] ?? null;
    const tree = appRoot ? serializeTree(appRoot, registry) : null;
    host.setRoot(tree && typeof tree !== "string" ? tree : null);
    router.onRender();
  };

  let dispose: (() => void) | null = null;
  let destroyed = false;
  let globalsInstalled = false;

  const reserveOwnership = (): void => {
    reserveSolidRootOwnership(owner);
  };

  const releaseOwnership = (): void => {
    if (!ownsGlobals()) return;
    try {
      if (globalsInstalled) {
        setUpdateCallback(null);
        setMutationUpdateCallback(null);
        setMutationCollector(null);
        setRootNode(null);
        setActiveTuiClock(null);
      }
    } finally {
      globalsInstalled = false;
      releaseSolidRootOwnership(owner);
    }
  };

  const installGlobals = (): void => {
    reserveOwnership();
    if (globalsInstalled) return;

    globalsInstalled = true;
    try {
      setRootNode(null);
      setMutationUpdateCallback(null);
      setMutationCollector(null);
      setUpdateCallback(sync);
      setActiveTuiClock(clock);
    } catch (error) {
      releaseOwnership();
      throw error;
    }
  };

  const disposeMount = (): void => {
    const activeDispose = dispose;
    dispose = null;
    try {
      activeDispose?.();
    } finally {
      registry.clear();
      if (ownsGlobals() && globalsInstalled) setRootNode(null);
    }
  };

  const root: TuiSolidRoot = {
    host,
    clock,

    render(App: () => unknown): void {
      if (destroyed) {
        throw new Error("Cannot render into a destroyed TUI Solid root");
      }
      installGlobals();
      disposeMount();
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
      try {
        dispose = solidRender(
          () =>
            createComponent(TuiRuntimeContext.Provider, {
              value: router,
              get children() {
                return App() as SolidNode;
              },
            }) as SolidNode,
          container,
        );
      } catch (error) {
        try {
          disposeMount();
        } catch {
          // Preserve the component mount error while cleaning up below.
        }
        try {
          releaseOwnership();
        } catch {
          // Preserve the component mount error while cleaning up below.
        }
        try {
          host.setRoot(null);
          router.onRender();
        } catch {
          // Preserve the component mount error after best-effort host cleanup.
        }
        throw error;
      }
      sync();
    },

    dispatchInput(event: TuiInputEvent): void {
      router.dispatch(event);
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      try {
        if (ownsGlobals() && globalsInstalled) disposeMount();
      } finally {
        releaseOwnership();
        host.destroy();
      }
    },
  };

  return root;
}

export function createTuiSolidRoot(options: TuiSolidRootOptions): TuiSolidRoot {
  return createTuiSolidRootInternal(options, {});
}

export function render(
  App: () => unknown,
  options: TuiSolidRenderOptions = {},
): TuiSolidApp {
  const input = options.input ?? (process.stdin as unknown as TtyInput);
  const output = options.output ?? (process.stdout as unknown as TtyOutput);
  const owner = {};
  reserveSolidRootOwnership(owner);

  let root: TuiSolidRoot | null = null;
  let driver: TerminalDriver | null = null;

  try {
    driver = new TerminalDriver({
      input,
      output,
      onEvent: (event) => {
        if (!root) return;
        if (event.type === "resize") {
          root.host.renderer.resize({
            width: event.width,
            height: event.height,
          });
        } else {
          root.dispatchInput(event);
        }
      },
    });
    driver.start();
    const styles = new StyleTable();
    root = createTuiSolidRootInternal(
      {
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
      },
      owner,
    );
    root.render(App);
  } catch (error) {
    try {
      root?.destroy();
    } catch {
      // Preserve the initial mount error after attempting root cleanup.
    }
    releaseSolidRootOwnership(owner);
    try {
      driver?.stop();
    } catch {
      // Preserve the initial reservation, startup, or mount error.
    }
    throw error;
  }

  const mountedRoot = root;
  const activeDriver = driver;

  return {
    host: mountedRoot.host,
    clock: mountedRoot.clock,
    driver: activeDriver,
    render: (next) => {
      try {
        mountedRoot.render(next);
      } catch (error) {
        try {
          mountedRoot.destroy();
        } catch {
          // Preserve the replacement mount error after best-effort root cleanup.
        }
        try {
          activeDriver.stop();
        } catch {
          // Preserve the replacement mount error after best-effort terminal cleanup.
        }
        throw error;
      }
    },
    dispatchInput: (event) => mountedRoot.dispatchInput(event),
    destroy: () => {
      try {
        mountedRoot.destroy();
      } finally {
        activeDriver.stop();
      }
    },
  };
}
