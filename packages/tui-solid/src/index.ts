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

interface PendingSolidRootCleanup {
  owner: object;
  root: { destroy(): void };
}

let pendingSolidRootCleanup: PendingSolidRootCleanup | null = null;
let retryingPendingSolidRootCleanup = false;

function retryPendingSolidRootCleanup(nextOwner: object): void {
  const pending = pendingSolidRootCleanup;
  if (!pending || pending.owner === nextOwner) return;
  if (retryingPendingSolidRootCleanup) {
    throw new Error("TUI Solid root cleanup is already in progress");
  }

  retryingPendingSolidRootCleanup = true;
  try {
    pending.root.destroy();
    if (pendingSolidRootCleanup === pending) pendingSolidRootCleanup = null;
  } finally {
    retryingPendingSolidRootCleanup = false;
  }
}

function reserveSolidRootOwnership(owner: object): void {
  retryPendingSolidRootCleanup(owner);
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

function destroySolidRoot(owner: object, root: { destroy(): void }): void {
  try {
    root.destroy();
    if (
      pendingSolidRootCleanup?.owner === owner &&
      pendingSolidRootCleanup.root === root
    ) {
      pendingSolidRootCleanup = null;
    }
  } catch (error) {
    pendingSolidRootCleanup = { owner, root };
    throw error;
  }
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
  let teardownStarted = false;
  let globalsInstalled = false;
  let hostDestroyed = false;

  const reserveOwnership = (): void => {
    reserveSolidRootOwnership(owner);
  };

  const releaseOwnership = (): void => {
    if (!ownsGlobals()) return;
    if (globalsInstalled) {
      setUpdateCallback(null);
      setMutationUpdateCallback(null);
      setMutationCollector(null);
      setRootNode(null);
      setActiveTuiClock(null);
    }
    globalsInstalled = false;
    releaseSolidRootOwnership(owner);
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
    try {
      activeDispose?.();
      if (dispose === activeDispose) dispose = null;
    } finally {
      registry.clear();
      if (ownsGlobals() && globalsInstalled) setRootNode(null);
    }
  };

  const root: TuiSolidRoot = {
    host,
    clock,

    render(App: () => unknown): void {
      if (hostDestroyed && !ownsGlobals()) {
        throw new Error("Cannot render into a destroyed TUI Solid root");
      }
      if (teardownStarted) {
        throw new Error(
          "Cannot render after TUI Solid root teardown has started",
        );
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
        if (dispose === null) {
          try {
            releaseOwnership();
          } catch {
            // Preserve the component mount error while cleaning up below.
          }
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
      if (teardownStarted) {
        throw new Error(
          "Cannot dispatch input after TUI Solid root teardown has started",
        );
      }
      router.dispatch(event);
    },

    destroy(): void {
      if (hostDestroyed && dispose === null && !ownsGlobals()) return;
      teardownStarted = true;

      let firstError: unknown;
      let hasError = false;
      const attempt = (cleanup: () => void, complete?: () => void): void => {
        try {
          cleanup();
          complete?.();
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      };

      if (dispose !== null) attempt(disposeMount);
      // Never transfer the module-global renderer while its old Solid disposer
      // is still pending; a late disposer could corrupt the new root.
      if (dispose === null && ownsGlobals()) attempt(releaseOwnership);
      if (!hostDestroyed) {
        attempt(
          () => host.destroy(),
          () => {
            hostDestroyed = true;
          },
        );
      }

      if (hasError) throw firstError;
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
      if (root) destroySolidRoot(owner, root);
    } catch {
      // Preserve the initial mount error after attempting root cleanup.
    }
    if (!root) releaseSolidRootOwnership(owner);
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
          destroySolidRoot(owner, mountedRoot);
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
      let firstError: unknown;
      let hasError = false;
      try {
        destroySolidRoot(owner, mountedRoot);
      } catch (error) {
        firstError = error;
        hasError = true;
      }
      try {
        activeDriver.stop();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }
      if (hasError) throw firstError;
    },
  };
}
