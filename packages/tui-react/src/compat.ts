import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { isReactReentrantUnmountError } from "@uniview/react-renderer";
import {
  AnsiCellSurface,
  StyleTable,
  TerminalDriver,
  type Size,
  type TtyInput,
  type TtyOutput,
} from "@uniview/tui-core";
import { createTuiReactRoot } from "./index";

type NamedColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray";

export interface BoxProps {
  children?: ReactNode;
  flexDirection?: "row" | "column";
  padding?: number;
  gap?: number;
  width?: number;
  height?: number;
}

/** Compatibility `Box` — a flex container mapped to the new `box` primitive. */
export function Box({
  children,
  flexDirection,
  padding,
  gap,
  width,
  height,
}: BoxProps): ReactElement {
  return createElement(
    "box",
    { flexDirection, padding, gap, width, height },
    children,
  );
}

export interface TextProps {
  children?: ReactNode;
  color?: NamedColor;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
}

/** Compatibility `Text` mapped to the new `text` primitive. */
export function Text({
  children,
  color,
  bold,
  dim,
  inverse,
}: TextProps): ReactElement {
  return createElement("text", { color, bold, dim, inverse }, children);
}

export interface ButtonProps {
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

/** Compatibility `Button` — a pressable box labelled `[ … ]`. */
export function Button({
  children,
  onPress,
  disabled,
}: ButtonProps): ReactElement {
  return createElement(
    "box",
    { onClick: disabled ? undefined : onPress, disabled },
    createElement("text", null, "[ ", children, " ]"),
  );
}

export interface InputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  width?: number;
}

/** Compatibility `Input` — an editable text field showing its value. */
export function Input({
  value = "",
  onChange,
  placeholder,
  width,
}: InputProps): ReactElement {
  const display = value.length > 0 ? value : (placeholder ?? "");
  return createElement(
    "input",
    { value, onChange, placeholder, width },
    createElement("text", null, display),
  );
}

/** Compatibility `Newline` — a blank line. */
export function Newline(): ReactElement {
  return createElement("text", null, "");
}

export interface CreateTuiRootOptions {
  width?: number;
  height?: number;
  input?: TtyInput;
  output?: TtyOutput;
}

export interface TuiRoot {
  render(element: ReactElement): void;
  destroy(): void;
}

/**
 * Compatibility `createTuiRoot` — wires the new stack (ANSI surface +
 * TerminalDriver + React root) so existing `@uniview/tui-renderer` code runs
 * on the new architecture with the same `root.render(<App/>)` shape.
 */
export function createTuiRoot(options: CreateTuiRootOptions = {}): TuiRoot {
  const input = options.input ?? (process.stdin as unknown as TtyInput);
  const output = options.output ?? (process.stdout as unknown as TtyOutput);
  const size: Size = {
    width: options.width ?? output.columns ?? 80,
    height: options.height ?? output.rows ?? 24,
  };

  const styles = new StyleTable();
  let surface: AnsiCellSurface | null = null;
  let root: ReturnType<typeof createTuiReactRoot> | null = null;
  let surfaceDestroyed = false;
  const cleanupRoot = (): void => {
    if (root) {
      root.destroy();
      return;
    }
    if (!surface || surfaceDestroyed) return;
    surface.destroy();
    surfaceDestroyed = true;
  };

  const driver = new TerminalDriver({
    input,
    output,
    onEvent: (event) => {
      const activeRoot = root;
      if (!activeRoot) return;
      if (event.type === "resize") {
        activeRoot.host.renderer.resize({
          width: event.width,
          height: event.height,
        });
      } else {
        activeRoot.dispatchInput(event);
      }
    },
  });

  try {
    driver.start({
      cleanup: cleanupRoot,
      retainSessionOnError: isReactReentrantUnmountError,
    });
    surface = new AnsiCellSurface({
      write: (chunk) => output.write(chunk),
      styles,
    });
    root = createTuiReactRoot({ surface, styles, size });
  } catch (error) {
    try {
      driver.stop();
    } catch {
      // Preserve startup/construction failure; the core driver keeps any
      // pending generic cleanup barrier registered on the streams.
    }
    throw error;
  }

  const mountedRoot = root;
  if (!mountedRoot) {
    throw new Error("TUI React compatibility root initialization failed");
  }

  return {
    render: (element) => {
      try {
        mountedRoot.render(element);
      } catch (error) {
        try {
          driver.stop();
        } catch {
          // Preserve the replacement render error while retaining cleanup.
        }
        throw error;
      }
    },
    destroy: () => driver.stop(),
  };
}
