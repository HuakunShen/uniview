/**
 * JSON-safe value type for cross-boundary serialization
 */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue };

/**
 * Layout tags that are rendered as native HTML elements
 * These are handled specially by host adapters
 */
export type UILayoutTag =
  | "div"
  | "span"
  | "p"
  | "section"
  | "header"
  | "footer"
  | "nav"
  | "main"
  | "aside"
  | "article"
  | "ul"
  | "ol"
  | "li"
  | "br"
  | "hr"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "button"
  | "input"
  | "textarea"
  | "select"
  | "option"
  | "label"
  | "form"
  | "a"
  | "img"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td"
  | "strong"
  | "em"
  | "code"
  | "pre";

/**
 * List of all layout tags for runtime checking
 */
export const LAYOUT_TAGS: readonly UILayoutTag[] = [
  "div",
  "span",
  "p",
  "section",
  "header",
  "footer",
  "nav",
  "main",
  "aside",
  "article",
  "ul",
  "ol",
  "li",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "form",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "strong",
  "em",
  "code",
  "pre",
] as const;

/**
 * Reserved node type for text content (protocol v3).
 * Text nodes carry their content in `text` and have no props/children.
 */
export const TEXT_NODE_TYPE = "#text";

/**
 * Core UI node structure for the serializable component tree
 *
 * This is the protocol-level representation of a UI element.
 * - `id` is required for stable reconciliation on the host side
 * - `type` is either a layout tag, a product-defined primitive, or
 *   TEXT_NODE_TYPE for text content
 * - `props` contains only JSON-serializable values
 * - `children` can be nested UINodes or text strings
 *
 * Since protocol v3, serializers emit text children as explicit
 * `{type: TEXT_NODE_TYPE, text}` nodes with stable ids so mutations can
 * address them (insertBefore anchors, setText by node id). Bare string
 * children remain in the type for backward compatibility and hosts should
 * keep rendering them, but v3 plugins no longer produce them.
 */
export interface UINode {
  /** Unique identifier for this node (for reconciliation) */
  id: string;
  /** Component type - layout tag, product primitive, or TEXT_NODE_TYPE */
  type: string;
  /** Props object with only JSON-serializable values */
  props: Record<string, JSONValue>;
  /** Child nodes or text content */
  children: (UINode | string)[];
  /** Text content — only set when `type` is TEXT_NODE_TYPE */
  text?: string;
}

/**
 * Check if a type string is a layout tag
 */
export function isLayoutTag(type: string): type is UILayoutTag {
  return LAYOUT_TAGS.includes(type as UILayoutTag);
}

/**
 * Check if a node is a text node (protocol v3 explicit text representation)
 */
export function isTextUINode(
  node: UINode | string,
): node is UINode & { text: string } {
  return typeof node !== "string" && node.type === TEXT_NODE_TYPE;
}

/**
 * Read the text content of a child, whether it uses the v3 explicit text
 * node form or the legacy bare-string form.
 */
export function textContent(node: UINode | string): string | null {
  if (typeof node === "string") return node;
  if (node.type === TEXT_NODE_TYPE) return node.text ?? "";
  return null;
}
