import { AnsiCellSurface } from "../surface/ansi-surface";
import type { CursorState } from "../buffer/frame";
import type { RenderNode } from "../paint/paint";
import { TuiRenderer } from "../renderer/tui-renderer";
import { StyleTable } from "../style/style-table";
import type { Size } from "../surface/types";
import {
  TerminalDriver,
  type TtyInput,
  type TtyOutput,
} from "../terminal/terminal-driver";
import type { MouseMode, ScreenMode } from "../terminal/sequences";
import type { TuiInputEvent } from "../input/events";

export type { RenderNode } from "../paint/paint";

export interface CreateTuiAppOptions {
  input: TtyInput;
  output: TtyOutput;
  screen?: ScreenMode;
  mouse?: MouseMode;
  cursor?: CursorState;
  styles?: StyleTable;
}

export interface TuiApp {
  readonly renderer: TuiRenderer;
  readonly size: Size;
  /** Replace the scene and paint it. */
  render(scene: RenderNode | null): void;
  /** Subscribe to input events; returns an unsubscribe function. */
  onInput(handler: (event: TuiInputEvent) => void): () => void;
  /** Restore the terminal and tear everything down. */
  destroy(): void;
}

/**
 * Compose a runnable, framework-agnostic TUI app from the core pieces: an ANSI
 * surface writing to `output`, a {@link TerminalDriver} owning the terminal and
 * parsing `input`, and a {@link TuiRenderer} driving frames. Resize events
 * re-render at the new geometry; other events are dispatched to `onInput`
 * handlers. This is the plan's "direct mode" — no React/Solid required.
 */
export function createTuiApp(options: CreateTuiAppOptions): TuiApp {
  const styles = options.styles ?? new StyleTable();
  const handlers = new Set<(event: TuiInputEvent) => void>();
  let surface: AnsiCellSurface | null = null;
  let renderer: TuiRenderer | null = null;
  let teardownStarted = false;
  let rendererDestroyed = false;

  const cleanupRenderer = (): void => {
    if (rendererDestroyed) return;
    if (renderer) renderer.destroy();
    else surface?.destroy();
    rendererDestroyed = true;
  };

  const driver = new TerminalDriver({
    input: options.input,
    output: options.output,
    screen: options.screen,
    mouse: options.mouse,
    onEvent: dispatch,
  });

  const latchRendererTeardown = (): void => {
    if (!teardownStarted && renderer && !renderer.isActive) {
      teardownStarted = true;
      handlers.clear();
    }
  };

  const assertActive = (): void => {
    latchRendererTeardown();
    if (teardownStarted) {
      throw new Error("Cannot use a TUI app after teardown has started");
    }
  };

  function dispatch(event: TuiInputEvent): void {
    latchRendererTeardown();
    if (teardownStarted || !renderer) return;
    if (event.type === "resize") {
      renderer.resize({ width: event.width, height: event.height });
      renderer.flush();
      return;
    }
    for (const handler of handlers) {
      latchRendererTeardown();
      if (teardownStarted) return;
      handler(event);
    }
  }

  try {
    driver.start({ cleanup: cleanupRenderer });
    surface = new AnsiCellSurface({
      write: (chunk) => options.output.write(chunk),
      styles,
    });
    renderer = new TuiRenderer({
      surface,
      styles,
      size: driver.size,
      cursor: options.cursor,
    });
  } catch (error) {
    teardownStarted = true;
    handlers.clear();
    try {
      driver.stop();
    } catch {
      // Preserve the startup/construction error. The driver retains any
      // pending renderer barrier for the next owner to retry.
    }
    throw error;
  }

  const activeRenderer = renderer;
  if (!activeRenderer) {
    throw new Error("TUI renderer initialization did not complete");
  }

  return {
    renderer: activeRenderer,
    get size(): Size {
      return driver.size;
    },
    render(scene: RenderNode | null): void {
      assertActive();
      try {
        activeRenderer.setRoot(scene);
        activeRenderer.flush();
      } catch (error) {
        teardownStarted = true;
        handlers.clear();
        try {
          driver.stop();
        } catch {
          // Preserve the replacement render error. Any pending cleanup stays
          // registered with the driver for this or the next owner to retry.
        }
        throw error;
      }
    },
    onInput(handler: (event: TuiInputEvent) => void): () => void {
      assertActive();
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    destroy(): void {
      teardownStarted = true;
      handlers.clear();
      driver.stop();
    },
  };
}
