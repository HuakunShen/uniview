import {
  EVENT_PROPS,
  TEXT_NODE_TYPE,
  extractEventName,
  isHandlerIdProp,
  textContent,
  type EventPropName,
  type HandlerId,
  type JSONValue,
  type UINode,
} from "@uniview/protocol";
import type { CellStyle, RenderNode, StyledSpan, TuiStyle } from "@uniview/tui-core";

/** Element types treated as inline text (their text children are flattened). */
const TEXT_TYPES = new Set([
  "text",
  "span",
  "p",
  "strong",
  "em",
  "code",
  "label",
]);

/** Layout props copied straight through to {@link TuiStyle}. */
const STYLE_KEYS: readonly (keyof TuiStyle)[] = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "justifyContent",
  "alignItems",
  "alignSelf",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "margin",
  "padding",
  "gap",
  "rowGap",
  "columnGap",
  "border",
  "overflow",
  "zIndex",
];

const TEXT_STYLE_FLAGS: readonly (keyof CellStyle)[] = [
  "bold",
  "dim",
  "italic",
  "underline",
  "strikethrough",
  "inverse",
];

function propsToStyle(props: Record<string, JSONValue>): TuiStyle {
  const style: Record<string, unknown> = {};
  for (const key of STYLE_KEYS) {
    const value = props[key];
    if (value !== undefined) style[key] = value;
  }
  return style as TuiStyle;
}

function propsToTextStyle(props: Record<string, JSONValue>): CellStyle {
  const style: Record<string, unknown> = {};
  if (typeof props.color === "string") style.fg = props.color;
  if (typeof props.backgroundColor === "string") style.bg = props.backgroundColor;
  for (const flag of TEXT_STYLE_FLAGS) {
    if (props[flag] === true) style[flag] = true;
  }
  return style as CellStyle;
}

/** Coerce a JSON `spans` prop into {@link StyledSpan}s, dropping malformed entries. */
function parseSpans(value: JSONValue | undefined): StyledSpan[] {
  if (!Array.isArray(value)) return [];
  const spans: StyledSpan[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, JSONValue>;
    if (typeof record.text !== "string") continue;
    const span: StyledSpan = { text: record.text };
    const style = record.style;
    if (style !== null && typeof style === "object" && !Array.isArray(style)) {
      span.style = style as CellStyle;
    }
    spans.push(span);
  }
  return spans;
}

function joinText(node: UINode): string {
  let text = "";
  for (const child of node.children) {
    const content = textContent(child);
    if (content !== null) text += content;
  }
  return text;
}

/**
 * Convert a protocol {@link UINode} (or bare string child) into a
 * {@link RenderNode} for @uniview/tui-core. Text elements flatten their text
 * children; box elements recurse. The node id is preserved so painted cells map
 * back to plugin nodes for hit-testing and event dispatch.
 */
export function uinodeToRenderNode(node: UINode | string): RenderNode | null {
  if (typeof node === "string") return { type: "text", text: node };
  if (node.type === TEXT_NODE_TYPE) return { type: "text", text: node.text ?? "" };

  const style = propsToStyle(node.props);

  if (node.type === "richtext") {
    const rendered: RenderNode = {
      type: "richtext",
      id: node.id,
      style,
      spans: parseSpans(node.props.spans),
    };
    if (typeof node.props.backgroundColor === "string") {
      rendered.background = node.props.backgroundColor;
    }
    return rendered;
  }

  if (TEXT_TYPES.has(node.type)) {
    return {
      type: "text",
      id: node.id,
      text: joinText(node),
      textStyle: propsToTextStyle(node.props),
      style,
    };
  }

  const rendered: RenderNode = {
    type: node.type,
    id: node.id,
    style,
    children: node.children
      .map(uinodeToRenderNode)
      .filter((c): c is RenderNode => c !== null),
  };
  if (typeof node.props.backgroundColor === "string") {
    rendered.background = node.props.backgroundColor;
  }
  return rendered;
}

/**
 * Walk a UINode tree and collect the handler ids attached to each node, keyed
 * by node id, so the host can dispatch events without re-parsing props.
 */
export function extractHandlers(
  root: UINode | null,
): Map<string, Partial<Record<EventPropName, HandlerId>>> {
  const handlers = new Map<string, Partial<Record<EventPropName, HandlerId>>>();
  if (!root) return handlers;

  const visit = (node: UINode): void => {
    let entry: Partial<Record<EventPropName, HandlerId>> | undefined;
    for (const [key, value] of Object.entries(node.props)) {
      if (!isHandlerIdProp(key) || typeof value !== "string") continue;
      const event = extractEventName(key);
      if (!event || !EVENT_PROPS.includes(event)) continue;
      (entry ??= {})[event] = value;
    }
    if (entry) handlers.set(node.id, entry);
    for (const child of node.children) {
      if (typeof child !== "string") visit(child);
    }
  };

  visit(root);
  return handlers;
}
