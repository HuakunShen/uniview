import { isHandlerIdProp, textContent, type UINode } from "@uniview/protocol/core";

/** A serializable accessibility node derived from the UINode tree. */
export interface SemanticNode {
  id: string;
  role: string;
  name?: string;
  text?: string;
  /** Current value of a textbox. */
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  children: SemanticNode[];
}

const TEXT_TYPES = new Set([
  "#text",
  "text",
  "span",
  "p",
  "strong",
  "em",
  "code",
  "label",
]);
const TEXTBOX_TYPES = new Set(["input", "textarea", "textbox"]);

function hasClickHandler(node: UINode): boolean {
  return Object.keys(node.props).some(
    (key) => isHandlerIdProp(key) && key.includes("onClick"),
  );
}

function inferRole(node: UINode): string {
  const explicit = node.props.role;
  if (typeof explicit === "string") return explicit;
  if (node.type === "checkbox" || node.type === "switch") return "checkbox";
  if (node.type === "tab") return "tab";
  if (TEXTBOX_TYPES.has(node.type)) return "textbox";
  if (node.type === "button" || hasClickHandler(node)) return "button";
  if (TEXT_TYPES.has(node.type)) return "text";
  return "group";
}

/** Flattened text content of a node's subtree. */
function collectText(node: UINode): string {
  if (node.type === "#text") return node.text ?? "";
  let out = "";
  for (const child of node.children) {
    const direct = textContent(child);
    out += direct !== null ? direct : typeof child === "string" ? child : collectText(child);
  }
  return out;
}

function accessibleName(node: UINode, text: string): string | undefined {
  const candidates = [node.props["aria-label"], node.props.name, node.props.label];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return text.length > 0 ? text : undefined;
}

/** Derive the semantic (accessibility) tree from a UINode tree. */
export function buildSemanticTree(node: UINode | null): SemanticNode | null {
  if (!node) return null;

  const role = inferRole(node);
  const text = collectText(node);
  const semantic: SemanticNode = {
    id: node.id,
    role,
    children: node.children
      .filter((c): c is UINode => typeof c !== "string" && c.type !== "#text")
      .map((c) => buildSemanticTree(c))
      .filter((c): c is SemanticNode => c !== null),
  };

  if (role === "text") {
    semantic.text = text;
  } else {
    // A group's name never comes from aggregated descendant text — only an
    // explicit label — so text queries don't match container ancestors.
    const name = accessibleName(node, role === "group" ? "" : text);
    if (name !== undefined) semantic.name = name;
  }

  if (role === "textbox" && typeof node.props.value === "string") {
    semantic.value = node.props.value;
  }
  if (node.props.disabled === true) semantic.disabled = true;
  if (node.props.checked === true) semantic.checked = true;
  if (node.props.selected === true) semantic.selected = true;

  return semantic;
}

export interface RoleQuery {
  name?: string | RegExp;
}

function matches(value: string | undefined, matcher: string | RegExp): boolean {
  if (value === undefined) return false;
  return typeof matcher === "string" ? value === matcher : matcher.test(value);
}

function* walk(node: SemanticNode | null): Iterable<SemanticNode> {
  if (!node) return;
  yield node;
  for (const child of node.children) yield* walk(child);
}

/** First node matching `role` (and optional accessible name). */
export function queryByRole(
  tree: SemanticNode | null,
  role: string,
  query: RoleQuery = {},
): SemanticNode | null {
  for (const node of walk(tree)) {
    if (node.role !== role) continue;
    if (query.name !== undefined && !matches(node.name, query.name)) continue;
    return node;
  }
  return null;
}

/** First node whose text or name matches. */
export function queryByText(
  tree: SemanticNode | null,
  matcher: string | RegExp,
): SemanticNode | null {
  for (const node of walk(tree)) {
    if (matches(node.text, matcher) || matches(node.name, matcher)) return node;
  }
  return null;
}

/** Node with the given id. */
export function queryById(
  tree: SemanticNode | null,
  id: string,
): SemanticNode | null {
  for (const node of walk(tree)) {
    if (node.id === id) return node;
  }
  return null;
}
