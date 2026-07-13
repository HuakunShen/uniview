// Text engine
export {
  graphemesOf,
  unicodeWidth,
  stringCellWidth,
  defaultWidthCalculator,
} from "./text/graphemes";
export type { CellWidth, WidthCalculator } from "./text/graphemes";

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

// Render loop
export { TuiRenderer } from "./renderer/tui-renderer";
export type { TuiRendererOptions } from "./renderer/tui-renderer";

// Runnable app (direct mode)
export { createTuiApp } from "./app/create-tui-app";
export type { TuiApp, CreateTuiAppOptions } from "./app/create-tui-app";

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

// Input
export { InputParser } from "./input/parser";
export { keyEvent, NO_MODIFIERS } from "./input/events";
export type { TuiInputEvent, KeyModifiers } from "./input/events";

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

// Paint pipeline
export { renderToBuffer } from "./paint/paint";
export type { RenderNode, RenderOutput } from "./paint/paint";
export { OwnerTable } from "./paint/owner-table";
export { borderGlyphs, BORDER_PRESETS } from "./paint/border";
export type { BorderGlyphs } from "./paint/border";

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
