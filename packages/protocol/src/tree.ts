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
 * Core UI node structure for the serializable component tree
 *
 * This is the protocol-level representation of a UI element.
 * - `id` is required for stable reconciliation on the host side
 * - `type` is either a layout tag or a product-defined primitive
 * - `props` contains only JSON-serializable values
 * - `children` can be nested UINodes or text strings
 */
export interface UINode {
  /** Unique identifier for this node (for reconciliation) */
  id: string;
  /** Component type - layout tag OR product-defined primitive */
  type: string;
  /** Props object with only JSON-serializable values */
  props: Record<string, JSONValue>;
  /** Child nodes or text content */
  children: (UINode | string)[];
}

/**
 * Check if a type string is a layout tag
 */
export function isLayoutTag(type: string): type is UILayoutTag {
  return LAYOUT_TAGS.includes(type as UILayoutTag);
}
