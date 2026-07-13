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
