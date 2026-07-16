// Text engine
export {
  graphemesOf,
  unicodeWidth,
  stringCellWidth,
  defaultWidthCalculator,
} from "./text/graphemes";
export type { CellWidth, WidthCalculator } from "./text/graphemes";
export {
  styledLineWidth,
  styledLineText,
} from "./text/styled-text";
export type { StyledSpan, StyledLine } from "./text/styled-text";
export { maskText, DEFAULT_MASK } from "./text/mask";

// Cell buffer
export { CellBuffer, CellFlags } from "./buffer/cell-buffer";
export type { CellView } from "./buffer/cell-buffer";

// Serializable frame model
export { frameToLines, frameToText, serializeFrame } from "./buffer/frame";
export type {
  CursorState,
  SerializedCell,
  SerializableCellFrame,
  FrameTextOptions,
} from "./buffer/frame";

// Style interning
export { StyleTable, DEFAULT_STYLE_ID } from "./style/style-table";
export type { CellStyle, Color, RgbColor } from "./style/style-table";

// Frame diff
export { diffFrames } from "./diff/frame-diff";
export type { CellRun } from "./diff/frame-diff";

// Surfaces
export type {
  CellSurface,
  FrameUpdate,
  PresentStats,
  Size,
  SurfaceKind,
} from "./surface/types";
export { buildFrameUpdate, HIDDEN_CURSOR } from "./surface/frame-update";
export { MemoryCellSurface } from "./surface/memory-surface";
export type { MemoryCellSurfaceOptions } from "./surface/memory-surface";
export { AnsiCellSurface } from "./surface/ansi-surface";
export type { AnsiCellSurfaceOptions } from "./surface/ansi-surface";
export { SvgCellSurface, renderSvg } from "./surface/svg-surface";
export type { SvgRenderOptions } from "./surface/svg-surface";

// Color palette
export { resolveColorCss, NAMED_HEX } from "./style/palette";

// Theme & color depth
export { defaultTheme, themeSpacing } from "./theme/theme";
export type { TuiTheme, ThemeColors } from "./theme/theme";
export { nearestNamedColor, rgbToAnsi256 } from "./theme/color-depth";

// Syntax theme (semantic scope → color)
export {
  CORE_SYNTAX_SCOPES,
  defaultSyntaxTheme,
  githubLightTheme,
  styleForScope,
  syntaxThemes,
  tokyoNightTheme,
} from "./theme/syntax-theme";
export type { SyntaxScope, SyntaxTheme } from "./theme/syntax-theme";

// Styled-lines → render tree bridge
export { styledLinesToRenderNode } from "./content/styled-render";
export type { StyledLinesOptions } from "./content/styled-render";

// ANSI encoding
export {
  sgrFor,
  sgrParams,
  cursorTo,
  SGR_RESET,
  CURSOR_SHOW,
  CURSOR_HIDE,
} from "./ansi/encode";

// Style contract & layout
export {
  resolveInsets,
  borderInsets,
  resolveDimension,
} from "./style/tui-style";
export type {
  TuiStyle,
  Dimension,
  InsetsValue,
  Insets,
  FlexDirection,
  JustifyContent,
  AlignItems,
  AlignSelf,
  BorderValue,
} from "./style/tui-style";
export { computeLayout } from "./layout/layout";
export type {
  LayoutInput,
  LayoutResult,
  LayoutBox,
  MeasureConstraints,
} from "./layout/layout";
export { customLayoutEngine } from "./layout/engine";
export type { LayoutEngine } from "./layout/engine";
// The Yoga adapter pulls in the yoga-layout WASM; keep it off the engine.ts /
// paint.ts path so the zero-dependency custom engine stays WASM-free.
export { yogaLayoutEngine } from "./layout/yoga-engine";

// Render loop
export { TuiRenderer } from "./renderer/tui-renderer";
export type { TuiRendererOptions } from "./renderer/tui-renderer";

// Render backend abstraction (Gate A conformance)
export {
  createTypeScriptBackend,
  renderBackendFrame,
  CONFORMANCE_FIXTURES,
} from "./backend/render-backend";
export type {
  RenderBackend,
  RenderResult,
  BackendFixture,
} from "./backend/render-backend";

// Runnable app (direct mode)
export { createTuiApp } from "./app/create-tui-app";
export type { TuiApp, CreateTuiAppOptions } from "./app/create-tui-app";
export { CommittedOutput } from "./app/committed-output";
export type { CommittedOutputOptions } from "./app/committed-output";

// Terminal lifecycle
export { TerminalDriver } from "./terminal/terminal-driver";
export type {
  TerminalDriverOptions,
  TtyInput,
  TtyOutput,
} from "./terminal/terminal-driver";
export {
  buildEnterSequence,
  buildLeaveSequence,
  DEFAULT_MODE_OPTIONS,
} from "./terminal/sequences";
export type {
  ScreenMode,
  MouseMode,
  TerminalModeOptions,
} from "./terminal/sequences";
export {
  withTerminalRestore,
  withTerminalRestoreAsync,
  installCrashGuard,
} from "./terminal/crash-guard";
export type { Restorable, ProcessLike } from "./terminal/crash-guard";

// Input
export { InputParser } from "./input/parser";
export { keyEvent, NO_MODIFIERS } from "./input/events";
export type { TuiInputEvent, KeyModifiers } from "./input/events";
export { toInputKey } from "./input/input-key";
export type { KeyMeta } from "./input/input-key";

// Virtualization
export {
  computeVirtualWindow,
  VirtualListMachine,
} from "./virtual/virtual-window";
export type {
  VirtualWindow,
  VirtualWindowOptions,
  VirtualListInit,
} from "./virtual/virtual-window";

// Focus & hit-testing
export { FocusManager } from "./focus/focus-manager";
export type { Focusable, FocusReason } from "./focus/focus-manager";
export { hitTest } from "./focus/hit-test";

// Headless component state machines
export { TextInputMachine } from "./components/text-input-machine";
export type {
  TextInputEffect,
  TextInputInit,
} from "./components/text-input-machine";
export { PressableMachine } from "./components/pressable-machine";
export type {
  PressableEffect,
  PressableInit,
} from "./components/pressable-machine";
export { CheckboxMachine } from "./components/checkbox-machine";
export type { CheckboxEffect, CheckboxInit } from "./components/checkbox-machine";
export { TabsMachine } from "./components/tabs-machine";
export type { TabsEffect, TabsInit } from "./components/tabs-machine";
export { SelectionMachine } from "./components/selection-machine";
export type { SelectionEffect, SelectionInit } from "./components/selection-machine";
export { TreeMachine } from "./components/tree-machine";
export type { TreeEffect, TreeInit, TreeSourceNode, FlatTreeRow } from "./components/tree-machine";
export { CalendarMachine } from "./components/calendar-machine";
export type { CalendarEffect, CalendarInit, CalendarCell, YearMonthDay } from "./components/calendar-machine";
export {
  resolveColumnWidths,
  formatCell,
  cycleSort,
  orderRows,
} from "./components/table-columns";
export type {
  Column,
  TableProps,
  ColumnAlign,
  ColumnSpec,
  ResolvedColumn,
  SortDirection,
  SortState,
} from "./components/table-columns";
export { textInputSlices } from "./components/text-input-view";
export type { TextInputSlices, TextInputSliceOptions } from "./components/text-input-view";

// Framework-agnostic UI event types & pure helpers (shared by tui-react/tui-solid)
export {
  clampScroll,
  filterCommands,
  listCounter,
  nextFocus,
  scrollbarThumb,
} from "./ui/events";
export type {
  TuiEventHandlers,
  TuiKeyEvent,
  TuiPointerEvent,
  TuiSemanticProps,
  TuiWheelEvent,
} from "./ui/events";

// Paint pipeline
export { renderToBuffer } from "./paint/paint";
export type { RenderNode, RenderOutput } from "./paint/paint";
export { OwnerTable } from "./paint/owner-table";
export { borderGlyphs, BORDER_PRESETS } from "./paint/border";
export type { BorderGlyphs } from "./paint/border";

// Canvas rasterizers (charts)
export { VERTICAL_BLOCKS, HORIZONTAL_BLOCKS, verticalBarColumn, horizontalBarCells } from "./canvas/blocks";
export { SubcellCanvas } from "./canvas/subcell";
export { dataToPixel } from "./canvas/coords";
// Public Canvas & shapes engine (Phase 7) — emits styled lines like charts
export { DrawContext, renderCanvas } from "./canvas/draw";
export type { Marker, DrawStyle, CanvasDraw, CanvasDrawOptions } from "./canvas/draw";
export { drawWorldMap, WORLD_MAP_POINTS } from "./canvas/world-map";

// Scheduling & diagnostics
export { RenderScheduler } from "./scheduler/scheduler";
export type {
  Invalidation,
  RenderKind,
  RenderSchedulerOptions,
} from "./scheduler/scheduler";
export {
  DiagnosticsTracker,
  isIdle,
  waitForIdle,
} from "./scheduler/diagnostics";
export type {
  HostDiagnostics,
  DiagnosticsSource,
  WaitForIdleOptions,
} from "./scheduler/diagnostics";
// Animation engine (easings)
export {
  bounceIn,
  bounceInOut,
  bounceOut,
  cubicIn,
  cubicInOut,
  cubicOut,
  easings,
  expoIn,
  expoInOut,
  expoOut,
  linear,
  quadIn,
  quadInOut,
  quadOut,
  resolveEasing,
  sineIn,
  sineInOut,
  sineOut,
} from "./scheduler/ease";
export type { EasingFn, EasingName } from "./scheduler/ease";
export { Timeline } from "./scheduler/timeline";
export type { TimelineOptions } from "./scheduler/timeline";
export { FrameClock } from "./scheduler/frame-clock";
export type { FrameClockOptions, FrameInfo, FrameListener } from "./scheduler/frame-clock";
