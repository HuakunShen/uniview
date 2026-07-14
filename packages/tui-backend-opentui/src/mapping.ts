import type { RenderNode } from "@uniview/tui-core";

/** OpenTUI BoxRenderable-shaped options (the subset the adapter maps). */
export interface OpenTuiBoxDescriptor {
  type: "box";
  options: {
    flexDirection?: "row" | "column";
    width?: number | string;
    height?: number | string;
    padding?: number;
    backgroundColor?: string;
    borderStyle?: "single" | "rounded" | "double";
  };
  children: OpenTuiDescriptor[];
}

/** OpenTUI TextRenderable-shaped options. */
export interface OpenTuiTextDescriptor {
  type: "text";
  content: string;
  options: {
    fg?: string;
    bg?: string;
    attributes?: { bold?: boolean; italic?: boolean; underline?: boolean };
  };
}

export type OpenTuiDescriptor = OpenTuiBoxDescriptor | OpenTuiTextDescriptor;

function isTextLeaf(node: RenderNode): boolean {
  return node.text !== undefined && (node.children?.length ?? 0) === 0;
}

function dimension(value: unknown): number | string | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "auto") return value;
  return undefined;
}

function borderStyle(value: unknown): OpenTuiBoxDescriptor["options"]["borderStyle"] {
  if (value === true) return "single";
  if (value === "single" || value === "rounded" || value === "double") return value;
  return undefined;
}

function colorToString(color: unknown): string | undefined {
  if (typeof color === "string") return color;
  if (color && typeof color === "object" && "r" in color) {
    const c = color as { r: number; g: number; b: number };
    return `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return undefined;
}

/**
 * Map a tui-core {@link RenderNode} to an OpenTUI Renderable descriptor — the
 * pure core of the OpenTUI backend adapter (§11.5 Gate A). The descriptor is
 * what `createOpenTuiBackend` turns into `new BoxRenderable`/`TextRenderable`
 * when @opentui/core is available; keeping it pure makes the mapping testable
 * without the native runtime.
 */
export function toOpenTuiDescriptor(node: RenderNode): OpenTuiDescriptor {
  if (isTextLeaf(node)) {
    const textStyle = node.textStyle ?? {};
    const attributes: Record<string, boolean> = {};
    if (textStyle.bold) attributes.bold = true;
    if (textStyle.italic) attributes.italic = true;
    if (textStyle.underline) attributes.underline = true;
    const options: OpenTuiTextDescriptor["options"] = {};
    const fg = colorToString(textStyle.fg);
    const bg = colorToString(textStyle.bg);
    if (fg !== undefined) options.fg = fg;
    if (bg !== undefined) options.bg = bg;
    if (Object.keys(attributes).length > 0) options.attributes = attributes;
    return { type: "text", content: node.text ?? "", options };
  }

  const style = node.style ?? {};
  const options: OpenTuiBoxDescriptor["options"] = {};
  if (style.flexDirection === "row" || style.flexDirection === "column") {
    options.flexDirection = style.flexDirection;
  }
  const width = dimension(style.width);
  const height = dimension(style.height);
  if (width !== undefined) options.width = width;
  if (height !== undefined) options.height = height;
  if (typeof style.padding === "number") options.padding = style.padding;
  const bg = colorToString(node.background);
  if (bg !== undefined) options.backgroundColor = bg;
  const border = borderStyle(style.border);
  if (border !== undefined) options.borderStyle = border;

  return {
    type: "box",
    options,
    children: (node.children ?? []).map(toOpenTuiDescriptor),
  };
}
