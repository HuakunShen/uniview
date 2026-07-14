import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";
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
  | "black" | "red" | "green" | "yellow" | "blue"
  | "magenta" | "cyan" | "white" | "gray";

export interface BoxProps {
  children?: ReactNode;
  flexDirection?: "row" | "column";
  padding?: number;
  gap?: number;
  width?: number;
  height?: number;
}

/** Compatibility `Box` — a flex container mapped to the new `box` primitive. */
export function Box({ children, flexDirection, padding, gap, width, height }: BoxProps): ReactElement {
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
export function Text({ children, color, bold, dim, inverse }: TextProps): ReactElement {
  return createElement("text", { color, bold, dim, inverse }, children);
}

export interface ButtonProps {
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

/** Compatibility `Button` — a pressable box labelled `[ … ]`. */
export function Button({ children, onPress, disabled }: ButtonProps): ReactElement {
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
export function Input({ value = "", onChange, placeholder, width }: InputProps): ReactElement {
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
  const surface = new AnsiCellSurface({ write: (chunk) => output.write(chunk), styles });
  const root = createTuiReactRoot({ surface, styles, size });

  const driver = new TerminalDriver({
    input,
    output,
    onEvent: (event) => {
      if (event.type === "resize") {
        root.host.renderer.resize({ width: event.width, height: event.height });
      } else {
        root.dispatchInput(event);
      }
    },
  });
  driver.start();

  return {
    render: (element) => root.render(element),
    destroy: () => {
      root.destroy();
      driver.stop();
    },
  };
}
