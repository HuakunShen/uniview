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

  const surface = new AnsiCellSurface({
    write: (chunk) => options.output.write(chunk),
    styles,
  });

  const driver = new TerminalDriver({
    input: options.input,
    output: options.output,
    screen: options.screen,
    mouse: options.mouse,
    onEvent: dispatch,
  });

  const renderer = new TuiRenderer({
    surface,
    styles,
    size: driver.size,
    cursor: options.cursor,
  });

  let teardownStarted = false;
  let rendererDestroyed = false;
  let driverStopped = false;

  const assertActive = (): void => {
    if (teardownStarted) {
      throw new Error("Cannot use a TUI app after teardown has started");
    }
  };

  function dispatch(event: TuiInputEvent): void {
    if (teardownStarted) return;
    if (event.type === "resize") {
      renderer.resize({ width: event.width, height: event.height });
      renderer.flush();
      return;
    }
    for (const handler of handlers) handler(event);
  }

  try {
    driver.start();
  } catch (error) {
    teardownStarted = true;
    handlers.clear();
    try {
      renderer.destroy();
      rendererDestroyed = true;
    } catch {
      // Preserve the terminal startup error.
    }
    try {
      driver.stop();
      driverStopped = true;
    } catch {
      // A later app on the same streams can retry pending driver cleanup.
    }
    throw error;
  }

  return {
    renderer,
    get size(): Size {
      return driver.size;
    },
    render(scene: RenderNode | null): void {
      assertActive();
      renderer.setRoot(scene);
      renderer.flush();
    },
    onInput(handler: (event: TuiInputEvent) => void): () => void {
      assertActive();
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    destroy(): void {
      if (rendererDestroyed && driverStopped) return;
      teardownStarted = true;
      handlers.clear();

      let firstError: unknown;
      let hasError = false;
      const attempt = (cleanup: () => void, complete: () => void): void => {
        try {
          cleanup();
          complete();
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      };

      if (!rendererDestroyed) {
        attempt(
          () => renderer.destroy(),
          () => {
            rendererDestroyed = true;
          },
        );
      }
      if (!driverStopped) {
        attempt(
          () => driver.stop(),
          () => {
            driverStopped = true;
          },
        );
      }

      if (hasError) throw firstError;
    },
  };
}
