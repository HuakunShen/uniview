import ansiEscapes from "ansi-escapes";
import stringWidth from "string-width";
import type { TextNode, TuiNode } from "../reconciler/types";

export interface TerminalRendererOptions {
  width?: number;
  height?: number;
  debug?: boolean;
}

type ColorName =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray";

interface CellStyle {
  color?: ColorName;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
}

interface Cell {
  ch: string;
  style: CellStyle;
}

interface LayoutNode {
  node: TuiNode | TextNode;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
  text: string | undefined;
}

interface FocusableNode {
  id: string;
  type: "Button" | "Input";
  props: Record<string, unknown>;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TerminalRendererState {
  root: TuiNode | null;
  focusables: FocusableNode[];
  focusIndex: number;
  inputValues: Map<string, string>;
  started: boolean;
  width: number;
  height: number;
}

const RESET = "\u001b[0m";
const STYLE_BOLD = "\u001b[1m";
const STYLE_DIM = "\u001b[2m";
const STYLE_INVERSE = "\u001b[7m";

const COLOR_CODES: Record<ColorName, string> = {
  black: "\u001b[30m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  white: "\u001b[37m",
  gray: "\u001b[90m",
};

function isTextNode(node: TuiNode | TextNode): node is TextNode {
  return "_isTextNode" in node;
}

function getNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function measureNode(node: TuiNode | TextNode): {
  width: number;
  height: number;
  text?: string;
} {
  if (isTextNode(node)) {
    return { width: stringWidth(node.text), height: 1, text: node.text };
  }

  if (node.type === "Newline") {
    return { width: 0, height: 1 };
  }

  const padding = getNumber(node.props["padding"], 0);
  const gap = getNumber(node.props["gap"], 0);
  const direction = node.props["flexDirection"] === "row" ? "row" : "column";

  let contentWidth = 0;
  let contentHeight = 0;
  let childCount = 0;

  for (const child of node.children) {
    const size = measureNode(child);
    childCount += 1;
    if (direction === "row") {
      contentWidth += size.width;
      contentHeight = Math.max(contentHeight, size.height);
    } else {
      contentWidth = Math.max(contentWidth, size.width);
      contentHeight += size.height;
    }
  }

  if (childCount > 1) {
    if (direction === "row") {
      contentWidth += gap * (childCount - 1);
    } else {
      contentHeight += gap * (childCount - 1);
    }
  }

  const width = getNumber(node.props["width"], contentWidth + padding * 2);
  const height = getNumber(node.props["height"], contentHeight + padding * 2);

  return { width, height };
}

function layoutNode(
  node: TuiNode | TextNode,
  x: number,
  y: number,
): LayoutNode {
  const size = measureNode(node);

  if (isTextNode(node)) {
    return {
      node,
      x,
      y,
      width: size.width,
      height: size.height,
      children: [],
      text: size.text,
    };
  }

  if (node.type === "Text" || node.type === "Button" || node.type === "Input") {
    return {
      node,
      x,
      y,
      width: size.width,
      height: size.height,
      children: [],
      text: size.text,
    };
  }

  if (node.type === "Newline") {
    return {
      node,
      x,
      y,
      width: size.width,
      height: size.height,
      children: [],
      text: undefined,
    };
  }

  const padding = getNumber(node.props["padding"], 0);
  const gap = getNumber(node.props["gap"], 0);
  const direction = node.props["flexDirection"] === "row" ? "row" : "column";

  let offsetX = x + padding;
  let offsetY = y + padding;

  const children: LayoutNode[] = [];
  for (const child of node.children) {
    const childLayout = layoutNode(child, offsetX, offsetY);
    children.push(childLayout);
    if (direction === "row") {
      offsetX += childLayout.width + gap;
    } else {
      offsetY += childLayout.height + gap;
    }
  }

  return {
    node,
    x,
    y,
    width: size.width,
    height: size.height,
    children,
    text: undefined,
  };
}

function createBuffer(width: number, height: number): Cell[][] {
  const buffer: Cell[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: Cell[] = [];
    for (let x = 0; x < width; x += 1) {
      row.push({ ch: " ", style: {} });
    }
    buffer.push(row);
  }
  return buffer;
}

function setCell(
  buffer: Cell[][],
  x: number,
  y: number,
  ch: string,
  style: CellStyle,
): void {
  if (y < 0 || y >= buffer.length) return;
  const row = buffer[y];
  if (!row || x < 0 || x >= row.length) return;
  row[x] = { ch, style };
}

function styleKey(style: CellStyle): string {
  return `${style.color ?? ""}|${style.bold ? 1 : 0}|${style.dim ? 1 : 0}|${style.inverse ? 1 : 0}`;
}

function styleToAnsi(style: CellStyle): string {
  let result = "";
  if (style.inverse) result += STYLE_INVERSE;
  if (style.bold) result += STYLE_BOLD;
  if (style.dim) result += STYLE_DIM;
  if (style.color) result += COLOR_CODES[style.color];
  return result;
}

function renderBuffer(buffer: Cell[][]): string {
  let output = "";
  for (const row of buffer) {
    let currentStyleKey = "";
    for (const cell of row) {
      const nextStyleKey = styleKey(cell.style);
      if (nextStyleKey !== currentStyleKey) {
        output += RESET;
        output += styleToAnsi(cell.style);
        currentStyleKey = nextStyleKey;
      }
      output += cell.ch;
    }
    output += RESET;
    output += "\n";
  }
  return output;
}

function extractStyle(node: TuiNode, extra?: Partial<CellStyle>): CellStyle {
  const style: CellStyle = {};
  if (typeof node.props["color"] === "string") {
    style.color = node.props["color"] as ColorName;
  }
  if (node.props["bold"] === true) style.bold = true;
  if (node.props["dim"] === true) style.dim = true;
  if (node.props["inverse"] === true) style.inverse = true;
  return { ...style, ...extra };
}

function drawText(
  buffer: Cell[][],
  x: number,
  y: number,
  text: string,
  style: CellStyle,
): void {
  let cursorX = x;
  for (const char of text) {
    setCell(buffer, cursorX, y, char, style);
    cursorX += 1;
  }
}

function collectFocusables(
  layout: LayoutNode,
  focusables: FocusableNode[],
): void {
  if (!isTextNode(layout.node)) {
    if (layout.node.type === "Button" || layout.node.type === "Input") {
      const id = layout.node.id;
      const text = layout.text ?? "";
      focusables.push({
        id,
        type: layout.node.type,
        props: layout.node.props,
        text,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
      });
    }
  }

  for (const child of layout.children) {
    collectFocusables(child, focusables);
  }
}

function drawNode(
  buffer: Cell[][],
  layout: LayoutNode,
  focusedId: string | null,
  inputValues: Map<string, string>,
): void {
  if (isTextNode(layout.node)) {
    drawText(buffer, layout.x, layout.y, layout.node.text, {});
    return;
  }

  const node = layout.node;
  if (node.type === "Text") {
    const style = extractStyle(node);
    const text = layout.text ?? "";
    drawText(buffer, layout.x, layout.y, text, style);
    return;
  }

  if (node.type === "Button") {
    const isFocused = focusedId === node.id;
    const text = layout.text ?? "Button";
    const label = `[ ${text} ]`;
    const style = extractStyle(node, isFocused ? { inverse: true } : {});
    drawText(buffer, layout.x, layout.y, label, style);
    return;
  }

  if (node.type === "Input") {
    const isFocused = focusedId === node.id;
    const value =
      typeof node.props["value"] === "string"
        ? (node.props["value"] as string)
        : (inputValues.get(node.id) ?? "");
    const placeholder =
      typeof node.props["placeholder"] === "string"
        ? (node.props["placeholder"] as string)
        : "";
    const text = value.length > 0 ? value : placeholder;
    const display = text.padEnd(Math.max(0, layout.width - 4), " ");
    const label = `[ ${display} ]`;
    const style = extractStyle(
      node,
      isFocused ? { inverse: true } : value.length === 0 ? { dim: true } : {},
    );
    drawText(buffer, layout.x, layout.y, label, style);
    return;
  }

  if (node.type === "Newline") {
    return;
  }

  for (const child of layout.children) {
    drawNode(buffer, child, focusedId, inputValues);
  }
}

function isPrintable(key: string): boolean {
  return key.length === 1 && key >= " " && key !== "\u007f";
}

export function createTerminalRenderer(options: TerminalRendererOptions) {
  const state: TerminalRendererState = {
    root: null,
    focusables: [],
    focusIndex: 0,
    inputValues: new Map(),
    started: false,
    width: options.width ?? process.stdout.columns ?? 80,
    height: options.height ?? process.stdout.rows ?? 24,
  };

  const onData = (chunk: Buffer) => {
    const key = chunk.toString("utf8");
    if (key === "\u0003") {
      destroy();
      process.exit(0);
    }

    if (state.focusables.length === 0) return;

    if (key === "\t") {
      state.focusIndex = (state.focusIndex + 1) % state.focusables.length;
      render(state.root);
      return;
    }

    if (key === "\u001b[Z") {
      state.focusIndex =
        (state.focusIndex - 1 + state.focusables.length) %
        state.focusables.length;
      render(state.root);
      return;
    }

    const focused = state.focusables[state.focusIndex];
    if (!focused) return;

    if (key === "\r" || key === "\n" || key === " ") {
      if (focused.type === "Button") {
        const handler = focused.props["onPress"];
        if (typeof handler === "function") {
          (handler as () => void)();
        }
        render(state.root);
        return;
      }
    }

    if (focused.type === "Input") {
      const currentValue =
        typeof focused.props["value"] === "string"
          ? (focused.props["value"] as string)
          : (state.inputValues.get(focused.id) ?? "");
      if (key === "\u007f") {
        const nextValue = currentValue.slice(0, -1);
        if (typeof focused.props["onChange"] === "function") {
          (focused.props["onChange"] as (value: string) => void)(nextValue);
        }
        if (typeof focused.props["value"] !== "string") {
          state.inputValues.set(focused.id, nextValue);
        }
        render(state.root);
        return;
      }

      if (isPrintable(key)) {
        const nextValue = currentValue + key;
        if (typeof focused.props["onChange"] === "function") {
          (focused.props["onChange"] as (value: string) => void)(nextValue);
        }
        if (typeof focused.props["value"] !== "string") {
          state.inputValues.set(focused.id, nextValue);
        }
        render(state.root);
      }
    }
  };

  const start = () => {
    if (state.started) return;
    state.started = true;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", onData);
    }
    process.stdout.write(ansiEscapes.cursorHide);
  };

  const render = (root: TuiNode | null) => {
    state.root = root;
    state.width = options.width ?? process.stdout.columns ?? state.width;
    state.height = options.height ?? process.stdout.rows ?? state.height;
    start();

    process.stdout.write(ansiEscapes.clearScreen);
    process.stdout.write(ansiEscapes.cursorTo(0, 0));

    if (!root) {
      process.stdout.write(RESET);
      return;
    }

    const layout = layoutNode(root, 0, 0);
    const focusables: FocusableNode[] = [];
    collectFocusables(layout, focusables);

    const previousFocusedId = state.focusables[state.focusIndex]?.id ?? null;
    state.focusables = focusables;
    if (state.focusables.length === 0) {
      state.focusIndex = 0;
    } else if (previousFocusedId) {
      const nextIndex = state.focusables.findIndex(
        (item) => item.id === previousFocusedId,
      );
      state.focusIndex = nextIndex >= 0 ? nextIndex : 0;
    } else {
      state.focusIndex = 0;
    }

    const buffer = createBuffer(state.width, state.height);
    const focusedId = state.focusables[state.focusIndex]?.id ?? null;
    drawNode(buffer, layout, focusedId, state.inputValues);
    process.stdout.write(renderBuffer(buffer));
  };

  const destroy = () => {
    if (!state.started) return;
    state.started = false;
    if (process.stdin.isTTY) {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdout.write(ansiEscapes.cursorShow);
  };

  process.on("exit", () => {
    destroy();
  });

  return { render, destroy };
}
