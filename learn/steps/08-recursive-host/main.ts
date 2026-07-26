/**
 * Step 08 — The recursive host: one component that renders one node, and then
 * renders itself for each child.
 *
 * Step 07 defined the seam (`PluginController`, `ComponentRegistry`) and built
 * two hosts against it to prove the seam was real. This step zooms all the way
 * in on ONE of them — the web idiom — and distils the single file that every
 * web host adapter is a variation of:
 *
 *     packages/host-svelte/src/ComponentRenderer.svelte
 *
 * That file is 264 lines and its most important line is line 8:
 *
 *     import Self from "./ComponentRenderer.svelte";
 *
 * A component importing itself. That is the whole trick. There is no tree
 * walker, no visitor, no queue: the renderer handles exactly one node, and for
 * children it instantiates one more copy of itself. The recursion is the
 * component hierarchy.
 *
 * ── SCOPE NOTE, stated plainly ──────────────────────────────────────────────
 * `learn/` has no Svelte compiler and this step does not add one. Nothing here
 * was run through Svelte. What follows is the *algorithm* `ComponentRenderer.svelte`
 * embodies — recursive dispatch, prop transformation, handler binding, event
 * serialization — written in plain TypeScript, branch for branch in the real
 * file's order, and printing markup instead of creating DOM nodes. The doc
 * quotes the real Svelte source. Step 09 runs this same algorithm inside two
 * actual frameworks.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Three things a host adapter has to get right, and this file demonstrates each
 * by running into it:
 *
 *   1. RECURSION + DISPATCH. Seven branches, in a fixed order: bare string,
 *      text node, void element, six special-cased tags, generic `LAYOUT_TAGS`,
 *      `registry.has(type)`, and the `Unknown: <type>` fallback that must never
 *      throw and must never drop a subtree.
 *
 *   2. PROP TRANSFORMATION. `_onClickHandlerId: "node-10:onClick"` is a *string*
 *      in the tree. It has to become a real `onclick` function that calls
 *      `controller.executeHandler(...)`. `className` has to become `class`,
 *      `htmlFor` has to become `for`, a `style` object has to become a CSS
 *      string, and `_style` has to be dropped on the web (step 16).
 *
 *   3. EVENT SERIALIZATION. The bound function receives a live DOM `Event`. A
 *      DOM `Event` cannot cross a Worker or a socket: it is cyclic, it holds
 *      element references, and structured clone throws on it. So the host
 *      extracts a JSON subset *per event name* before calling into the plugin —
 *      `serializeHandlerArgs`. A click sends nothing at all; an input sends one
 *      string; a keydown sends six fields.
 */

// ---------------------------------------------------------------------------
// 1. The protocol, carried forward from steps 01/02/07
// ---------------------------------------------------------------------------
//
// Steps never import each other (learn/RULES.md), so the contract is
// re-declared. Unchanged from step 07 except that `LAYOUT_TAGS` is now the FULL
// 40-entry list copied from `packages/protocol/src/tree.ts` — this step
// special-cases six tags and needs the rest present to fall through to.

/** The only value kinds allowed in props: whatever a Swift decoder can rebuild. */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue }

/** Reserved node type for text content. Text is a node so mutations can address it. */
const TEXT_NODE_TYPE = "#text"

/** Copied verbatim from packages/protocol/src/tree.ts — all 40 entries. */
const LAYOUT_TAGS = [
  "div", "span", "p", "section", "header", "footer", "nav", "main", "aside",
  "article", "ul", "ol", "li", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
  "button", "input", "textarea", "select", "option", "label", "form", "a",
  "img", "table", "thead", "tbody", "tr", "th", "td", "strong", "em", "code",
  "pre",
] as const
type UILayoutTag = (typeof LAYOUT_TAGS)[number]

/** The whole node type: four required fields, one optional. */
export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
}

/** A function cannot cross a Worker boundary, so a callback travels as a string. */
export type HandlerId = string

const isLayoutTag = (type: string): type is UILayoutTag =>
  (LAYOUT_TAGS as readonly string[]).includes(type)

/** Read a child's text whether it is a v3 text node or a legacy bare string. */
const textContent = (node: UINode | string): string | null => {
  if (typeof node === "string") return node
  if (node.type === TEXT_NODE_TYPE) return node.text ?? ""
  return null
}

export interface AppendChildMutation {
  type: "appendChild"
  parentId: string
  node: UINode
}

export interface InsertBeforeMutation {
  type: "insertBefore"
  parentId: string
  node: UINode
  beforeId: string
}

export interface RemoveChildMutation {
  type: "removeChild"
  parentId: string
  nodeId: string
}

export interface SetTextMutation {
  type: "setText"
  nodeId: string
  text: string
}

export interface SetPropsMutation {
  type: "setProps"
  nodeId: string
  props: Record<string, JSONValue>
}

export interface SetRootMutation {
  type: "setRoot"
  node: UINode | null
}

export type Mutation =
  | AppendChildMutation
  | InsertBeforeMutation
  | RemoveChildMutation
  | SetTextMutation
  | SetPropsMutation
  | SetRootMutation

const text = (id: string, content: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: content,
})

/** Step 01/02/07's printer — used once, to show the tree the plugin actually sent. */
function show(node: UINode | string, depth = 0): string {
  const pad = "  ".repeat(depth)
  if (typeof node === "string") return `${pad}"${node}" (legacy bare string)`
  if (node.type === TEXT_NODE_TYPE) return `${pad}#text#${node.id} "${node.text}"`
  const props = Object.keys(node.props)
  const summary = props.length > 0 ? ` {${props.join(", ")}}` : ""
  return [
    `${pad}<${node.type}#${node.id}>${summary}`,
    ...node.children.map((c) => show(c, depth + 1)),
  ].join("\n")
}

// ---------------------------------------------------------------------------
// 2. NEW — the event half of the protocol, the REAL functions this time
// ---------------------------------------------------------------------------
//
// Step 07 read handler props with one regex, `_on([A-Z]\w*)HandlerId`, and
// lower-cased the capture. That is close enough for a diagram and wrong in
// practice, because it accepts anything shaped like an event. The real protocol
// exports three functions and a whitelist of ELEVEN names, and the difference
// between "shaped like an event" and "on the whitelist" is a branch every web
// host has to have — see `transformProps` below, where an off-whitelist handler
// prop is passed through as an attribute rather than bound or dropped.
//
// Copied from packages/protocol/src/events.ts.

export type EventPropName =
  | "onClick"
  | "onChange"
  | "onInput"
  | "onSubmit"
  | "onFocus"
  | "onBlur"
  | "onKeyDown"
  | "onKeyUp"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onWheel"

const EVENT_PROPS: readonly EventPropName[] = [
  "onClick",
  "onChange",
  "onInput",
  "onSubmit",
  "onFocus",
  "onBlur",
  "onKeyDown",
  "onKeyUp",
  "onMouseEnter",
  "onMouseLeave",
  "onWheel",
] as const

/** 'onClick' -> '_onClickHandlerId'. */
const handlerIdProp = (eventProp: EventPropName): string => `_${eventProp}HandlerId`

/**
 * '_onClickHandlerId' -> true. Note how loose this is on purpose: underscore
 * prefix, `HandlerId` suffix, nothing in between is checked. `isHandlerIdProp`
 * answers "did a serializer mint this?", not "can I fire it?".
 */
const isHandlerIdProp = (propName: string): boolean =>
  propName.startsWith("_") && propName.endsWith("HandlerId")

const HANDLER_ID_PREFIX_LENGTH = 1
const HANDLER_ID_SUFFIX_LENGTH = 9 // "HandlerId".length

/**
 * '_onClickHandlerId' -> 'onClick'; '_onSearchTextChangeHandlerId' -> null.
 * THIS is the whitelist check. Returning `null` is the interesting case: the
 * plugin registered a callback the host has no way to fire.
 */
function extractEventName(prop: string): EventPropName | null {
  if (!isHandlerIdProp(prop)) return null
  const eventName = prop.slice(HANDLER_ID_PREFIX_LENGTH, -HANDLER_ID_SUFFIX_LENGTH)
  if ((EVENT_PROPS as readonly string[]).includes(eventName)) {
    return eventName as EventPropName
  }
  return null
}

// ---------------------------------------------------------------------------
// 3. The step 07 contract, carried forward verbatim in shape and naming
// ---------------------------------------------------------------------------

export interface ComponentMetadata {
  version?: string
  propTypes?: Record<string, unknown>
}

export interface ComponentRegistry<T = unknown> {
  register(type: string, component: T, metadata?: ComponentMetadata): void
  get(type: string): T | undefined
  has(type: string): boolean
  list(): string[]
  clear(): void
}

interface RegistryEntry<T> {
  component: T
  metadata?: ComponentMetadata
}

function createComponentRegistry<T>(): ComponentRegistry<T> {
  const entries = new Map<string, RegistryEntry<T>>()
  return {
    register(type: string, component: T, metadata?: ComponentMetadata): void {
      entries.set(type, { component, metadata })
    },
    get(type: string): T | undefined {
      return entries.get(type)?.component
    },
    has(type: string): boolean {
      return entries.has(type)
    },
    list(): string[] {
      return Array.from(entries.keys())
    },
    clear(): void {
      entries.clear()
    },
  }
}

/** Where the plugin runs. The host's only visible clue that a boundary exists. */
export type HostMode = "worker" | "websocket" | "main"

/** Ten members, unchanged from step 07 and from packages/host-sdk/src/types.ts. */
export interface PluginController {
  connect(): Promise<void>
  disconnect(): Promise<void>
  updateProps(props: JSONValue): Promise<void>
  executeHandler(handlerId: HandlerId, args?: JSONValue[]): Promise<void>
  destroy(): Promise<void>
  syncTree(): Promise<void>
  getStatus(): { mode: HostMode; connected: boolean; lastError?: string }
  getTree(): UINode | null
  subscribe(cb: (tree: UINode | null) => void): () => void
  subscribeErrors?(cb: (message: string) => void): () => void
}

// ---------------------------------------------------------------------------
// 4. MutableTree, carried forward from step 02 unchanged
// ---------------------------------------------------------------------------
//
// Nothing in this step changes it. It is here because a controller owns one and
// this file needs a working controller for the click to actually change the UI.

class MutableTree {
  private tree: UINode | null = null
  private nodeIndex: Map<string, UINode> = new Map()
  private parentIndex: Map<string, string> = new Map()
  private readonly onError: (message: string) => void

  constructor(onError: (message: string) => void = (m) => console.error(m)) {
    this.onError = onError
  }

  applyMutations(mutations: Mutation[]): UINode | null {
    for (const mutation of mutations) this.applyMutation(mutation)
    return this.tree ? { ...this.tree } : null
  }

  private applyMutation(mutation: Mutation): void {
    switch (mutation.type) {
      case "setRoot":
        this.tree = mutation.node
        this.rebuildIndex()
        break
      case "appendChild":
        this.applyAppendChild(mutation)
        break
      case "insertBefore":
        this.applyInsertBefore(mutation)
        break
      case "removeChild":
        this.applyRemoveChild(mutation)
        break
      case "setText":
        this.applySetText(mutation)
        break
      case "setProps":
        this.applySetProps(mutation)
        break
    }
  }

  private rebuildIndex(): void {
    this.nodeIndex.clear()
    this.parentIndex.clear()
    if (this.tree) this.indexNode(this.tree, null)
  }

  private indexNode(node: UINode, parentId: string | null): void {
    this.nodeIndex.set(node.id, node)
    if (parentId !== null) this.parentIndex.set(node.id, parentId)
    else this.parentIndex.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") this.indexNode(child, node.id)
    }
  }

  private unindexNode(node: UINode): void {
    this.nodeIndex.delete(node.id)
    this.parentIndex.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") this.unindexNode(child)
    }
  }

  private replaceNode(targetId: string, newNode: UINode): void {
    this.nodeIndex.set(targetId, newNode)

    let childId = targetId
    let childNode = newNode
    while (this.tree && this.tree.id !== childId) {
      const parentId = this.parentIndex.get(childId)
      if (parentId === undefined) return
      const parent = this.nodeIndex.get(parentId)
      if (!parent) return

      const currentChildId = childId
      const newParent: UINode = {
        ...parent,
        children: parent.children.map((child) =>
          typeof child !== "string" && child.id === currentChildId ? childNode : child,
        ),
      }
      this.nodeIndex.set(parentId, newParent)
      childId = parentId
      childNode = newParent
    }

    if (this.tree && this.tree.id === childId) this.tree = childNode
  }

  private detachExistingNode(nodeId: string): void {
    const parentId = this.parentIndex.get(nodeId)
    if (parentId === undefined) return
    const parent = this.nodeIndex.get(parentId)
    if (!parent) return

    const newParent: UINode = {
      ...parent,
      children: parent.children.filter(
        (child) => typeof child === "string" || child.id !== nodeId,
      ),
    }
    this.parentIndex.delete(nodeId)
    this.replaceNode(parentId, newParent)
  }

  private applyAppendChild(mutation: AppendChildMutation): void {
    this.detachExistingNode(mutation.node.id)
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    const newParent: UINode = {
      ...parent,
      children: [...parent.children, mutation.node],
    }
    this.indexNode(mutation.node, mutation.parentId)
    this.replaceNode(mutation.parentId, newParent)
  }

  private applyInsertBefore(mutation: InsertBeforeMutation): void {
    this.detachExistingNode(mutation.node.id)
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    let insertIndex = -1
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i]
      if (typeof child !== "string" && child.id === mutation.beforeId) {
        insertIndex = i
        break
      }
    }
    if (insertIndex === -1) {
      this.onError(
        `[uniview] insertBefore anchor ${mutation.beforeId} not found under ` +
          `${mutation.parentId}; appending instead (tree state diverged)`,
      )
      insertIndex = parent.children.length
    }

    const newChildren = [...parent.children]
    newChildren.splice(insertIndex, 0, mutation.node)
    this.indexNode(mutation.node, mutation.parentId)
    this.replaceNode(mutation.parentId, { ...parent, children: newChildren })
  }

  private applyRemoveChild(mutation: RemoveChildMutation): void {
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    const newChildren = parent.children.filter((child) => {
      if (typeof child === "string") return true
      if (child.id === mutation.nodeId) {
        this.unindexNode(child)
        return false
      }
      return true
    })
    this.replaceNode(mutation.parentId, { ...parent, children: newChildren })
  }

  private applySetText(mutation: SetTextMutation): void {
    const node = this.nodeIndex.get(mutation.nodeId)
    if (!node) {
      this.onError(
        `[uniview] setText target ${mutation.nodeId} not found (tree state diverged)`,
      )
      return
    }
    this.replaceNode(mutation.nodeId, { ...node, text: mutation.text })
  }

  private applySetProps(mutation: SetPropsMutation): void {
    const node = this.nodeIndex.get(mutation.nodeId)
    if (!node) return
    this.replaceNode(mutation.nodeId, { ...node, props: mutation.props })
  }
}

// ---------------------------------------------------------------------------
// 5. NEW — serializeHandlerArgs: how a DOM event becomes JSON
// ---------------------------------------------------------------------------
//
// Mirrors packages/host-svelte/src/event-handlers.ts, whose own file comment is
// the reason this module exists at all:
//
//   "Converts Svelte component event callback arguments into JSON-safe values
//    before they cross Worker/kkrpc boundaries. DOM Event objects are not
//    structured-cloneable."
//
// Read the three rules as a table, because that is what they are:
//
//   onClick, onFocus, onBlur, onMouseEnter, onMouseLeave  ->  []   (nothing!)
//   onInput, onChange                                     ->  [event.target.value]
//   onKeyDown, onKeyUp                                    ->  [{key, code, alt, ctrl, meta, shift}]
//   anything else                                         ->  args.filter(isJsonValue)
//
// The first row is the one people find surprising. A click carries no
// information the plugin could not already know — it knows which node it put
// the handler on — so the host sends an empty argument list and the whole DOM
// event stays on this side of the boundary.

/** Shape of the fake DOM events this file constructs. A real one has ~30 more fields. */
interface FakeDomEvent {
  type: string
  target?: Record<string, unknown>
  currentTarget?: unknown
  preventDefault: () => void
  key?: string
  code?: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

const EVENT_ONLY_HANDLER_NAMES = new Set([
  "onClick",
  "onFocus",
  "onBlur",
  "onMouseEnter",
  "onMouseLeave",
])

function serializeHandlerArgs(eventName: string, args: unknown[]): JSONValue[] {
  if (args.length === 0) return []
  if (EVENT_ONLY_HANDLER_NAMES.has(eventName) && looksLikeDomEvent(args[0])) return []
  if ((eventName === "onInput" || eventName === "onChange") && looksLikeDomEvent(args[0])) {
    return [readTargetValue(args[0])]
  }
  if ((eventName === "onKeyDown" || eventName === "onKeyUp") && looksLikeKeyboardEvent(args[0])) {
    return [serializeKeyboardEvent(args[0])]
  }
  // Not a DOM event at all — a registered component called its callback with a
  // plain value. Keep whatever is JSON-safe and drop the rest.
  return args.filter(isJsonValue)
}

/**
 * Duck typing, not `instanceof Event`. Deliberate: the host code also runs
 * where a registered Svelte component invoked the callback by hand, and in
 * SSR/test environments where `Event` may not be the same class.
 */
function looksLikeDomEvent(
  value: unknown,
): value is { type?: unknown; target?: unknown; preventDefault?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    ("target" in value ||
      "currentTarget" in value ||
      "preventDefault" in value ||
      typeof (value as { type?: unknown }).type === "string")
  )
}

function looksLikeKeyboardEvent(value: unknown): value is {
  key?: unknown
  code?: unknown
  altKey?: unknown
  ctrlKey?: unknown
  metaKey?: unknown
  shiftKey?: unknown
} {
  return looksLikeDomEvent(value) && ("key" in value || "code" in value)
}

function readTargetValue(event: { target?: unknown }): JSONValue {
  const target = event.target
  if (target !== null && typeof target === "object" && "value" in target) {
    const value = (target as { value?: unknown }).value
    return isJsonValue(value) ? value : null
  }
  return null
}

function serializeKeyboardEvent(event: {
  key?: unknown
  code?: unknown
  altKey?: unknown
  ctrlKey?: unknown
  metaKey?: unknown
  shiftKey?: unknown
}): JSONValue {
  return {
    key: typeof event.key === "string" ? event.key : "",
    code: typeof event.code === "string" ? event.code : "",
    altKey: event.altKey === true,
    ctrlKey: event.ctrlKey === true,
    metaKey: event.metaKey === true,
    shiftKey: event.shiftKey === true,
  }
}

function isJsonValue(value: unknown): value is JSONValue {
  if (value === null) return true
  const valueType = typeof value
  if (valueType === "string" || valueType === "number" || valueType === "boolean") return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (valueType !== "object") return false
  return Object.values(value as Record<string, unknown>).every(isJsonValue)
}

// ---------------------------------------------------------------------------
// 6. NEW — the renderer: transformProps, attachEvents, and the recursion
// ---------------------------------------------------------------------------

/**
 * What a "component" is for THIS host: a function from transformed props plus
 * already-rendered child lines to markup lines. In the real Svelte host `T` is
 * Svelte's `Component`; in React it is a `ComponentType`. The `ComponentRegistry<T>`
 * type parameter from step 07 is what lets one interface serve all three.
 */
type MarkupComponent = (props: Record<string, unknown>, childLines: string[]) => string[]

/** A handler the renderer bound. Every one of them ends in `executeHandler`. */
type BoundHandler = (...args: unknown[]) => Promise<void>

/**
 * The real file declares ten separately-typed optional members here (`onclick?:
 * () => Promise<void>`, `oninput?: (e: Event) => Promise<void>`, ...). They all
 * hold the same function; the differing signatures are documentation of what
 * each one is handed. One type is enough for us.
 */
interface TransformedProps {
  attrs: Record<string, JSONValue>
  onclick?: BoundHandler
  oninput?: BoundHandler
  onchange?: BoundHandler
  onsubmit?: BoundHandler
  onfocus?: BoundHandler
  onblur?: BoundHandler
  onkeydown?: BoundHandler
  onkeyup?: BoundHandler
  onmouseenter?: BoundHandler
  onmouseleave?: BoundHandler
}

type HandlerSlot = Exclude<keyof TransformedProps, "attrs">

/** DOM event name -> which slot on TransformedProps holds it. Verbatim from the real file. */
const EVENT_MAP: Record<string, HandlerSlot> = {
  click: "onclick",
  input: "oninput",
  change: "onchange",
  submit: "onsubmit",
  focus: "onfocus",
  blur: "onblur",
  keydown: "onkeydown",
  keyup: "onkeyup",
  mouseenter: "onmouseenter",
  mouseleave: "onmouseleave",
}

/** The real set. Note `wbr`: it is NOT in LAYOUT_TAGS, yet it renders. See below. */
const VOID_ELEMENTS = new Set(["hr", "br", "img", "wbr"])

/** One row of the prop-transformation table this step prints. */
interface PropTransform {
  key: string
  value: JSONValue
  outcome: string
  becomes: string
}

/** One listener the `attachEvents` action put on an element. */
interface AttachedListener {
  nodeId: string
  domEvent: string
  handlerId: HandlerId
  listener: (event: FakeDomEvent) => Promise<void>
}

/** Which dispatch branch each node took — printed as proof the order matters. */
type Branch =
  | "bare string"
  | "text node"
  | "void element"
  | "special tag"
  | "layout tag"
  | "registry"
  | "unknown"

function createRecursiveHost(controller: PluginController) {
  const registry = createComponentRegistry<MarkupComponent>()

  // Rebuilt from scratch on every render, exactly like `attachEvents`'s
  // `cleanup` array: old listeners come off, new ones go on. See section 11 for
  // what the real (patching) version does instead of re-rendering everything.
  let listeners: AttachedListener[] = []
  let branches: Branch[] = []
  let lastTransform: PropTransform[] = []
  let transformTarget = ""

  /**
   * The bridge. `handlerId` is a string that came off the wire; `eventName` is
   * one of the eleven whitelisted names. Everything the plugin will ever learn
   * about this event passes through `serializeHandlerArgs`.
   *
   * Real source, verbatim (ComponentRenderer.svelte:21-25):
   *
   *   function createHandler(handlerId: string, eventName: string) {
   *     return async (...args: unknown[]) => {
   *       await controller.executeHandler(handlerId, serializeHandlerArgs(eventName, args));
   *     };
   *   }
   */
  function createHandler(handlerId: string, eventName: string): BoundHandler {
    return async (...args: unknown[]): Promise<void> => {
      const serialized = serializeHandlerArgs(eventName, args)
      console.log(
        `      [host]   executeHandler(${JSON.stringify(handlerId)}, ` +
          `${JSON.stringify(serialized)})   <-- the ONLY bytes that cross`,
      )
      await controller.executeHandler(handlerId, serialized)
    }
  }

  /**
   * Raw props in, DOM attributes + bound handler functions out. Branch for
   * branch in the real file's order (ComponentRenderer.svelte:41-115).
   *
   * `record` is teaching apparatus: it captures the decision made for each prop
   * so section 3 of the output can print the table. The real function just
   * returns `result`.
   */
  function transformProps(
    props: Record<string, JSONValue>,
    record?: PropTransform[],
  ): TransformedProps {
    const attrs: Record<string, JSONValue> = {}
    const result: TransformedProps = { attrs }
    const note = (key: string, value: JSONValue, outcome: string, becomes: string): void => {
      record?.push({ key, value, outcome, becomes })
    }

    for (const [key, value] of Object.entries(props)) {
      // React's own props. A v3 serializer already stripped these (step 04),
      // but a host does not control who is on the other end of the socket —
      // step 14 puts a whole other process there — so it skips them anyway.
      if (key === "children" || key === "key") {
        note(key, value, "skipped", "— (framework-internal)")
        continue
      }

      if (isHandlerIdProp(key)) {
        const eventName = extractEventName(key)
        // extractEventName returns null for handler props outside the DOM event
        // whitelist (EVENT_PROPS); those must still be passed through below,
        // not dropped.
        let matched = false
        if (eventName && typeof value === "string") {
          const handler = createHandler(value, eventName)
          matched = true
          if (eventName === "onChange") {
            // One plugin callback, TWO DOM events. React's onChange fires on
            // every keystroke; the DOM's `change` fires on commit. Binding both
            // is how the same tree behaves the same way in both worlds.
            result.oninput = handler
            result.onchange = handler
          } else if (eventName === "onInput") {
            result.oninput = handler
          } else if (eventName === "onClick") {
            result.onclick = handler
          } else if (eventName === "onSubmit") {
            result.onsubmit = handler
          } else if (eventName === "onFocus") {
            result.onfocus = handler
          } else if (eventName === "onBlur") {
            result.onblur = handler
          } else if (eventName === "onKeyDown") {
            result.onkeydown = handler
          } else if (eventName === "onKeyUp") {
            result.onkeyup = handler
          } else if (eventName === "onMouseEnter") {
            result.onmouseenter = handler
          } else if (eventName === "onMouseLeave") {
            result.onmouseleave = handler
          } else {
            // Reachable! `onWheel` is on the protocol whitelist and has no
            // branch here, so it lands in the pass-through below as an
            // attribute. A real finding in the real file, not a simplification.
            matched = false
          }
        }
        // Pass through unrecognized handler ID props as-is so registered host
        // components can relay them via executeHandler (e.g. app-level handlers
        // like _onSearchTextChangeHandlerId).
        if (!matched && typeof value === "string") {
          attrs[key] = value
          note(
            key,
            value,
            eventName === null ? "off whitelist" : "no DOM binding",
            `attrs[${JSON.stringify(key)}] (a component must relay it)`,
          )
        } else {
          note(key, value, "BOUND", `${eventNameToSlot(eventName)}() -> executeHandler`)
        }
        continue
      }

      if (key === "_style") {
        // The resolved Style IR, for hosts with no CSS engine (AppKit, WinUI).
        // On the web the authored `className` / `style` already say it.
        note(key, value, "skipped", "— (Style IR is for non-CSS hosts; step 16)")
        continue
      }

      if (key === "className") {
        attrs.class = value
        note(key, value, "renamed", "class")
      } else if (key === "htmlFor") {
        attrs.for = value
        note(key, value, "renamed", "for")
      } else if (key === "style" && typeof value === "object" && value !== null) {
        // Convert style objects to CSS strings (e.g. { padding: "20px" } -> "padding: 20px")
        const css = Object.entries(value as Record<string, JSONValue>)
          .map(([prop, val]) => {
            const cssProp = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
            return `${cssProp}: ${String(val)}`
          })
          .join("; ")
        attrs.style = css
        note(key, value, "flattened", `style="${css}"`)
      } else {
        attrs[key] = value
        note(key, value, "copied", `attrs.${key}`)
      }
    }

    return result
  }

  /** Which `TransformedProps` slot an event name landed in, for the table. */
  function eventNameToSlot(eventName: EventPropName | null): string {
    if (eventName === "onChange") return "oninput + onchange"
    return eventName === null ? "?" : eventName.toLowerCase()
  }

  /**
   * The `use:attachEvents` Svelte action, minus the element. The real one calls
   * `el.addEventListener(event, listener)` for each of the ten entries in
   * EVENT_MAP that has a handler, and returns `{ update, destroy }` so Svelte
   * can swap listeners when props change and remove them on unmount.
   *
   * Here there is no element, so a listener is recorded against the node id and
   * section 6 "clicks" it by calling the recorded function.
   */
  function attachEvents(node: UINode, handlers: TransformedProps): string[] {
    const attached: string[] = []
    for (const [domEvent, slot] of Object.entries(EVENT_MAP)) {
      const handler = handlers[slot]
      if (!handler) continue
      const handlerId = handlerIdFor(node, slot)
      listeners.push({
        nodeId: node.id,
        domEvent,
        handlerId,
        listener: wrapEventListener(domEvent, handler),
      })
      attached.push(domEvent)
    }
    return attached
  }

  /**
   * `submit` is the one event the HOST is allowed to act on before the plugin
   * hears about it: without `preventDefault()` the browser navigates and the
   * plugin's tree is gone before `executeHandler` resolves.
   *
   * Everything else passes the raw event straight through, because
   * `createHandler` runs it through `serializeHandlerArgs`. The real file
   * carries the scar: keydown/keyup used to be wrapped as `() => handler()`, so
   * plugins never saw which key was pressed.
   */
  function wrapEventListener(
    domEvent: string,
    handler: BoundHandler,
  ): (event: FakeDomEvent) => Promise<void> {
    if (domEvent === "submit") {
      return async (event: FakeDomEvent): Promise<void> => {
        event.preventDefault()
        await handler(event)
      }
    }
    return async (event: FakeDomEvent): Promise<void> => {
      await handler(event)
    }
  }

  /**
   * Walk back from a bound slot to the prop the id came from:
   * 'onkeydown' -> 'onKeyDown' -> '_onKeyDownHandlerId'. Only the listener
   * table needs this; the real host never looks the id up again, because
   * `createHandler` closed over it.
   */
  function handlerIdFor(node: UINode, slot: HandlerSlot): string {
    for (const name of EVENT_PROPS) {
      if (name.toLowerCase() !== slot) continue
      const id = node.props[handlerIdProp(name)]
      if (typeof id === "string") return id
    }
    // `onchange` is the odd one: `_onChangeHandlerId` binds BOTH oninput and
    // onchange, so a lookup by slot name alone can miss.
    const fallback = node.props[handlerIdProp("onChange")]
    return typeof fallback === "string" ? fallback : "?"
  }

  const indent = (lines: string[]): string[] => lines.map((l) => "  " + l)

  const attrString = (attrs: Record<string, JSONValue>): string => {
    const parts = Object.entries(attrs).map(([k, v]) =>
      typeof v === "string" ? `${k}="${v}"` : `${k}={${JSON.stringify(v)}}`,
    )
    return parts.length > 0 ? " " + parts.join(" ") : ""
  }

  /**
   * ========================================================================
   * THE RECURSIVE COMPONENT.
   * ========================================================================
   *
   * In Svelte this is a `.svelte` file whose template is one `{#if} ... {:else if}`
   * chain, and whose child loops read:
   *
   *     {#each node.children as child, i (typeof child === "string" ? `str-${i}` : child.id)}
   *       <Self node={child} />
   *     {/each}
   *
   * `Self` is the file importing itself. Here `Self` is this function calling
   * itself — same recursion, no compiler required. Note the keying expression:
   * children are keyed by `child.id`, which is why step 01 insisted every node
   * carry a stable id, and why bare string children (which have none) need the
   * index fallback.
   *
   * The BRANCH ORDER below is the real file's, and it is load-bearing:
   * `VOID_ELEMENTS` is tested before `LAYOUT_TAGS`, which is why `wbr` renders
   * at all despite not being a layout tag, and why `hr`/`br`/`img` never get
   * event listeners even though they are layout tags that could carry handler
   * props.
   */
  function Self(node: UINode | string): string[] {
    // ── branch 1: bare string children ─────────────────────────────────────
    // Legacy pre-v3 form. "NEVER drop text children - host adapters must render
    // string nodes" (CLAUDE.md anti-patterns).
    if (typeof node === "string") {
      branches.push("bare string")
      return [node]
    }

    // ── branch 2: text nodes ───────────────────────────────────────────────
    if (node.type === TEXT_NODE_TYPE) {
      branches.push("text node")
      return [node.text ?? ""]
    }

    const capture = node.id === transformTarget ? lastTransform : undefined
    const p = transformProps(node.props, capture)

    // ── branch 3: void elements — no children, and NO event listeners ──────
    if (VOID_ELEMENTS.has(node.type)) {
      branches.push("void element")
      return [`<${node.type}${attrString(p.attrs)} />`]
    }

    const childLines = node.children.flatMap(Self) //  <-- the `<Self node={child} />` loop

    // ── branch 4: six special-cased tags ──────────────────────────────────
    // `button` gets a class the host chose; `input`/`textarea` are self-closing
    // in this renderer's output; the rest exist so the markup is real HTML
    // rather than `<svelte:element>` guesswork.
    if (node.type === "button") {
      branches.push("special tag")
      // The real template is:
      //   <button class="cursor-pointer {p.attrs.class || ''}" {...p.attrs} use:attachEvents={p}>
      // Note the order: the spread comes AFTER the composed class, so a plugin
      // that sets `className` silently wins and `cursor-pointer` is lost. We put
      // the composed class last — the intent rather than the letter. Flagged in
      // the doc; this node has no className so both orders agree here.
      const cls = `cursor-pointer ${p.attrs.class ?? ""}`.trim()
      const rest = { ...p.attrs, class: cls }
      return wrap(node, rest, childLines, attachEvents(node, p))
    }
    if (node.type === "input") {
      branches.push("special tag")
      return [`<input${attrString(p.attrs)}${used(attachEvents(node, p))} />`]
    }
    if (node.type === "textarea" || node.type === "select" || node.type === "a" || node.type === "form") {
      branches.push("special tag")
      return wrap(node, p.attrs, childLines, attachEvents(node, p))
    }

    // ── branch 5: the other 34 layout tags, via <svelte:element> ───────────
    if (isLayoutTag(node.type)) {
      branches.push("layout tag")
      return wrap(node, p.attrs, childLines, attachEvents(node, p))
    }

    // ── branch 6: product primitives, via the registry ────────────────────
    if (registry.has(node.type)) {
      branches.push("registry")
      const component = registry.get(node.type)
      if (component) {
        const textChildren = node.children.map((c) => textContent(c) ?? "").join("")
        // Note what a registered component is handed that an element is not:
        // the raw child NODES (so it can render them itself), the UINode id,
        // and a `title` fallback built from text children. And note what it is
        // NOT handed: onmouseenter / onmouseleave have no entry here.
        const componentProps: Record<string, unknown> = {
          ...p.attrs,
          _childNodes: node.children,
          _nodeId: node.id,
          title: textChildren || p.attrs.title,
          onclick: p.onclick,
          oninput: p.oninput,
          onchange: p.onchange,
          onsubmit: p.onsubmit,
          onfocus: p.onfocus,
          onblur: p.onblur,
          onkeydown: p.onkeydown,
          onkeyup: p.onkeyup,
        }
        // The component owns its own event wiring, so the host does not attach
        // listeners here — it hands over the bound functions and steps back.
        // Recorded anyway so the click in section 6 has something to fire.
        for (const [domEvent, slot] of Object.entries(EVENT_MAP)) {
          const handler = componentProps[slot]
          if (typeof handler !== "function") continue
          listeners.push({
            nodeId: node.id,
            domEvent,
            handlerId: handlerIdFor(node, slot),
            listener: wrapEventListener(domEvent, handler as BoundHandler),
          })
        }
        return component(componentProps, childLines)
      }
    }

    // ── branch 7: the fallback ────────────────────────────────────────────
    // A type from a plugin this host does not control. Not an error: visible,
    // never thrown, never silently dropped. AppKit reached the same string
    // independently (`Unknown: \(node.type)`, in red).
    branches.push("unknown")
    return [`<div class="uniview-unknown">Unknown: ${node.type}</div>`]
  }

  /** Open tag / indented children / close tag, with the attached listeners noted. */
  function wrap(
    node: UINode,
    attrs: Record<string, JSONValue>,
    childLines: string[],
    attached: string[],
  ): string[] {
    const open = `<${node.type}${attrString(attrs)}${used(attached)}>`
    if (childLines.length === 0) return [open, `</${node.type}>`]
    return [open, ...indent(childLines), `</${node.type}>`]
  }

  /** Renders the `use:attachEvents={p}` directive so the binding is visible in the markup. */
  const used = (attached: string[]): string =>
    attached.length > 0 ? ` use:attachEvents={${attached.join(",")}}` : ""

  return {
    registry,
    /** The whole host: render one tree, and remember what it bound while doing it. */
    render(tree: UINode | null, captureFor = ""): string[] {
      listeners = []
      branches = []
      lastTransform = []
      transformTarget = captureFor
      return tree ? Self(tree) : ["(no tree)"]
    },
    listeners: (): AttachedListener[] => listeners,
    branches: (): Branch[] => branches,
    transform: (): PropTransform[] => lastTransform,
    /** Fire a listener the last render attached. This is the "user does something". */
    async dispatch(nodeId: string, domEvent: string, event: FakeDomEvent): Promise<boolean> {
      const found = listeners.find((l) => l.nodeId === nodeId && l.domEvent === domEvent)
      if (!found) return false
      await found.listener(event)
      return true
    },
  }
}

// ---------------------------------------------------------------------------
// 7. A controller with real plugin-side closures behind it
// ---------------------------------------------------------------------------
//
// Step 07's ScriptedController mapped a handler id to a fixed mutation batch and
// ignored the args. That was fine when the point was the seam. This step is
// about the args, so the map now holds actual CLOSURES that read them — the
// plugin-side end of step 04's handler registry.

type PluginClosure = (args: JSONValue[]) => Mutation[]

class ScriptedController implements PluginController {
  private tree = new MutableTree((m) => this.reportError(m))
  private current: UINode | null = null
  private isConnected = false
  private lastError: string | undefined
  private readonly subscribers = new Set<(tree: UINode | null) => void>()
  private readonly errorSubscribers = new Set<(message: string) => void>()

  constructor(
    private readonly firstFrame: Mutation[],
    private readonly closures: Record<HandlerId, PluginClosure>,
  ) {}

  async connect(): Promise<void> {
    this.isConnected = true
    this.apply(this.firstFrame)
  }

  async disconnect(): Promise<void> {
    this.isConnected = false
    this.current = null
    this.tree = new MutableTree((m) => this.reportError(m))
    this.notify()
  }

  async destroy(): Promise<void> {
    await this.disconnect()
    this.subscribers.clear()
    this.errorSubscribers.clear()
  }

  async updateProps(): Promise<void> {
    // Props travel DOWN. Not exercised in this step; step 12 builds the real one.
  }

  /**
   * The plugin side of the boundary. `handlerId` and `args` both arrived as
   * JSON — in step 13 they will literally have been structured-cloned — and the
   * closure they name never left this side.
   */
  async executeHandler(handlerId: HandlerId, args?: JSONValue[]): Promise<void> {
    if (!this.isConnected) return
    const closure = this.closures[handlerId]
    if (!closure) {
      this.reportError(`[uniview] no handler registered for ${handlerId}`)
      return
    }
    this.apply(closure(args ?? []))
  }

  async syncTree(): Promise<void> {
    if (!this.isConnected) return
    this.notify()
  }

  getTree(): UINode | null {
    return this.current
  }

  getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
    return {
      mode: "main",
      connected: this.isConnected,
      ...(this.lastError !== undefined ? { lastError: this.lastError } : {}),
    }
  }

  subscribe(cb: (tree: UINode | null) => void): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  subscribeErrors(cb: (message: string) => void): () => void {
    this.errorSubscribers.add(cb)
    return () => {
      this.errorSubscribers.delete(cb)
    }
  }

  private apply(mutations: Mutation[]): void {
    this.current = this.tree.applyMutations(mutations)
    this.notify()
  }

  private notify(): void {
    for (const cb of this.subscribers) cb(this.current)
  }

  private reportError(message: string): void {
    this.lastError = message
    for (const cb of this.errorSubscribers) cb(message)
  }
}

// ---------------------------------------------------------------------------
// 8. The tree — a small tunnel manager, as a plugin would have serialized it
// ---------------------------------------------------------------------------

/**
 * Node 9's props exist to exercise every branch of `transformProps` in one
 * node: two bound handlers, one whitelisted-but-unbound handler (`onWheel`),
 * one off-whitelist handler, `className`, a `style` object, `_style`, and the
 * two framework-internal keys a host skips defensively.
 */
const filterProps = (value: string): Record<string, JSONValue> => ({
  value,
  placeholder: "filter tunnels",
  className: "field",
  style: { fontSize: "14px", borderRadius: "6px" },
  _style: { color: "accent" },
  _onInputHandlerId: "node-9:onInput",
  _onKeyDownHandlerId: "node-9:onKeyDown",
  _onWheelHandlerId: "node-9:onWheel",
  _onSearchTextChangeHandlerId: "node-9:onSearchTextChange",
  children: "React puts the element's children here",
  key: "filter-field",
})

const treeV1: UINode = {
  id: "node-0",
  type: "div",
  props: { className: "panel", style: { padding: "16px", borderRadius: "8px" } },
  children: [
    {
      id: "node-1",
      type: "header",
      props: {},
      children: [
        { id: "node-2", type: "h2", props: {}, children: [text("node-3", "Tunnels")] },
        {
          id: "node-4",
          type: "p",
          props: { className: "muted" },
          children: [text("node-5", "Clicked 0 times")],
        },
      ],
    },
    {
      id: "node-6",
      type: "form",
      props: { _onSubmitHandlerId: "node-6:onSubmit" },
      children: [
        {
          id: "node-7",
          type: "label",
          props: { htmlFor: "filter-field" },
          children: [text("node-8", "Filter")],
        },
        { id: "node-9", type: "input", props: filterProps(""), children: [] },
        {
          id: "node-10",
          type: "button",
          props: { disabled: false, _onClickHandlerId: "node-10:onClick" },
          children: [text("node-11", "Add tunnel")],
        },
      ],
    },
    // A void element. Tested BEFORE the layout-tag branch, so it never gets a
    // listener even if a plugin puts a handler prop on it.
    { id: "node-12", type: "hr", props: {}, children: [] },
    {
      id: "node-13",
      type: "ul",
      props: {},
      children: [
        { id: "node-14", type: "li", props: {}, children: [text("node-15", "alpha - up")] },
        { id: "node-16", type: "li", props: {}, children: [text("node-17", "beta - up")] },
      ],
    },
    // A product primitive this host HAS registered.
    {
      id: "node-18",
      type: "Badge",
      props: { tone: "info", _onClickHandlerId: "node-18:onClick" },
      children: [text("node-19", "2 online")],
    },
    // A product primitive this host has NOT registered. The plugin was written
    // against a newer version of the product; this is the normal case, not an
    // error case.
    {
      id: "node-20",
      type: "Sparkline",
      props: { values: [1, 3, 5, 7, 5, 2] },
      children: [],
    },
  ],
}

// ---------------------------------------------------------------------------
// 9. The plugin-side closures — what actually runs when the host calls back
// ---------------------------------------------------------------------------
//
// Each one reads `args` (the JSON `serializeHandlerArgs` produced) and answers
// with mutations. Nothing here knows a DOM exists.

let clicks = 0
let filter = ""
let nextId = 100

const rows = [
  { id: "node-14", label: "alpha - up" },
  { id: "node-16", label: "beta - up" },
]

const visibleCount = (): number =>
  rows.filter((r) => r.label.includes(filter)).length

const closures: Record<HandlerId, PluginClosure> = {
  "node-10:onClick": (args) => {
    console.log(
      `      [plugin] closure "node-10:onClick" ran with args ${JSON.stringify(args)}`,
    )
    clicks++
    return [{ type: "setText", nodeId: "node-5", text: `Clicked ${clicks} times` }]
  },

  "node-9:onInput": (args) => {
    console.log(
      `      [plugin] closure "node-9:onInput" ran with args ${JSON.stringify(args)}`,
    )
    filter = typeof args[0] === "string" ? args[0] : ""
    const mutations: Mutation[] = [
      { type: "setProps", nodeId: "node-9", props: filterProps(filter) },
    ]
    for (const row of rows) {
      if (!row.label.includes(filter)) {
        mutations.push({ type: "removeChild", parentId: "node-13", nodeId: row.id })
      }
    }
    mutations.push({
      type: "setText",
      nodeId: "node-19",
      text: `${visibleCount()} online`,
    })
    return mutations
  },

  "node-9:onKeyDown": (args) => {
    console.log(
      `      [plugin] closure "node-9:onKeyDown" ran with args ${JSON.stringify(args)}`,
    )
    const payload = args[0]
    const key =
      payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? payload.key
        : undefined
    if (key !== "Enter") return []
    const rowId = `node-${nextId++}`
    const labelId = `node-${nextId++}`
    const label = `${filter}-2 - starting`
    rows.push({ id: rowId, label })
    return [
      {
        type: "appendChild",
        parentId: "node-13",
        node: {
          id: rowId,
          type: "li",
          props: {},
          children: [text(labelId, label)],
        },
      },
      { type: "setText", nodeId: "node-19", text: `${visibleCount()} online` },
    ]
  },

  "node-6:onSubmit": (args) => {
    console.log(
      `      [plugin] closure "node-6:onSubmit" ran with args ${JSON.stringify(args)}`,
    )
    return []
  },

  "node-18:onClick": (args) => {
    console.log(
      `      [plugin] closure "node-18:onClick" ran with args ${JSON.stringify(args)}`,
    )
    return []
  },
}

// ---------------------------------------------------------------------------
// 10. Wiring: PluginHost.svelte, in four lines
// ---------------------------------------------------------------------------
//
// The real `PluginHost.svelte` puts the controller and the registry into Svelte
// context (`setContext("uniview:controller", ...)`), subscribes, connects on
// mount, and renders `<ComponentRenderer node={tree} />`. Context is how a
// component 12 levels deep reaches the controller without 12 levels of prop
// drilling. Here the closure over `controller` in `createRecursiveHost` plays
// exactly that role.

const controller = new ScriptedController([{ type: "setRoot", node: treeV1 }], closures)
const host = createRecursiveHost(controller)

/** The application layer fills the registry — the renderer never does. */
const Badge: MarkupComponent = (props, childLines) => {
  const tone = String(props.tone ?? "neutral")
  const bound = typeof props.onclick === "function" ? " onclick={fn}" : ""
  const nodeCount = Array.isArray(props._childNodes) ? props._childNodes.length : 0
  const head = `<Badge tone="${tone}" title=${JSON.stringify(props.title)}${bound} _nodeId="${String(props._nodeId)}" _childNodes={${nodeCount}}>`
  return [head, ...childLines.map((l) => "  " + l), `</Badge>`]
}
host.registry.register("Badge", Badge, { version: "1.0.0" })

let markup: string[] = []
const errors: string[] = []
let captureNodeId = ""

const unsubscribe = controller.subscribe((tree) => {
  markup = host.render(tree, captureNodeId)
})
const unsubscribeErrors = controller.subscribeErrors?.((m) => errors.push(m)) ?? (() => {})

// ---------------------------------------------------------------------------
// 11. Run it
// ---------------------------------------------------------------------------

const rule = (title: string): void => console.log(`\n=== ${title} ===`)
const print = (lines: string[], pad = "  "): void => {
  for (const line of lines) console.log(pad + line)
}

/** Lines present in one rendering and not the other. Order-insensitive on purpose. */
function changed(before: string[], after: string[]): string[] {
  const b = new Set(before)
  const a = new Set(after)
  return [
    ...before.filter((l) => !a.has(l)).map((l) => `- ${l.trim()}`),
    ...after.filter((l) => !b.has(l)).map((l) => `+ ${l.trim()}`),
  ]
}

captureNodeId = "node-9"
await controller.connect()

rule("1. The tree the plugin sent")
console.log("  21 nodes. Nothing in it mentions an element, a listener or a DOM.")
print(show(treeV1).split("\n"), "    ")

rule("2. One function, called once per node, calling itself for children")
print(markup)

const tally = new Map<Branch, number>()
for (const b of host.branches()) tally.set(b, (tally.get(b) ?? 0) + 1)
console.log("\n  dispatch branches taken, in the real file's test order:")
for (const branch of [
  "bare string",
  "text node",
  "void element",
  "special tag",
  "layout tag",
  "registry",
  "unknown",
] as Branch[]) {
  console.log(`    ${branch.padEnd(14)} ${tally.get(branch) ?? 0}`)
}
console.log(
  "\n  Three KINDS of node, seven branches: layout tags the host hardcodes,\n" +
    "  product primitives it looks up, and text it prints. `Sparkline` took the\n" +
    "  seventh.",
)

rule("3. Prop transformation for one node — <input#node-9>")
console.log("  raw prop                          value                          -> becomes")
console.log("  " + "-".repeat(96))
for (const row of host.transform()) {
  const value = JSON.stringify(row.value)
  const shown = value.length > 28 ? value.slice(0, 27) + "…" : value
  console.log(
    `  ${row.key.padEnd(33)} ${shown.padEnd(30)} ${row.outcome.padEnd(14)} ${row.becomes}`,
  )
}
console.log(
  "\n  Two rows deserve a second look. `_onWheelHandlerId` IS on the protocol's\n" +
    "  eleven-name whitelist, but ComponentRenderer.svelte has no branch for it,\n" +
    "  so it falls out as an attribute — a real gap in the real file, not a\n" +
    "  simplification here. `_onSearchTextChangeHandlerId` is off the whitelist\n" +
    "  entirely and takes the same exit by design: a registered component can\n" +
    "  read it off its props and call executeHandler itself.",
)

rule("4. What `use:attachEvents` bound")
console.log("  node      DOM event   handler id")
for (const l of host.listeners()) {
  console.log(`  ${l.nodeId.padEnd(9)} ${l.domEvent.padEnd(11)} ${l.handlerId}`)
}
console.log(
  `\n  <hr#node-12> got none: void elements are tested BEFORE the layout-tag\n` +
    `  branch, so they never reach attachEvents. <Badge#node-18> got its\n` +
    `  onclick as a FUNCTION PROP instead — a registered component owns its own\n` +
    `  event wiring.`,
)

rule("5. A live DOM event cannot cross the boundary")
const target: Record<string, unknown> = { tagName: "BUTTON", value: null }
const clickEvent: FakeDomEvent = {
  type: "click",
  target,
  preventDefault: () => {},
}
// A real DOM event's `target` points at an element whose `ownerDocument` points
// back at a tree containing the element. Two lines is enough to reproduce the
// shape that makes structured clone and JSON.stringify both fail.
clickEvent.currentTarget = target
target.__lastEvent = clickEvent
try {
  JSON.stringify(clickEvent)
  console.log("  JSON.stringify(event) succeeded — expected it to throw")
} catch (err) {
  console.log(`  JSON.stringify(event) -> ${(err as Error).message.split("\n")[0]}`)
}
console.log(
  "  structuredClone(event) fails the same way in a browser (DataCloneError on\n" +
    "  the element reference). So the host extracts a JSON subset per event name:",
)
console.log(
  `    onClick   -> ${JSON.stringify(serializeHandlerArgs("onClick", [clickEvent]))}` +
    "                       (nothing at all)",
)
console.log(
  `    onInput   -> ${JSON.stringify(
    serializeHandlerArgs("onInput", [{ type: "input", target: { value: "beta" } }]),
  )}`,
)
console.log(
  `    onKeyDown -> ${JSON.stringify(
    serializeHandlerArgs("onKeyDown", [
      {
        type: "keydown",
        key: "Enter",
        code: "Enter",
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
        target: { value: "beta" },
      },
    ]),
  )}`,
)

rule("6. A user clicks the button")
const before6 = [...markup]
console.log(`      [user]   click on <button#node-10>`)
const clicked = await host.dispatch("node-10", "click", clickEvent)
console.log(`      [host]   listener found and fired: ${clicked}`)
console.log("      [host]   subscriber re-rendered; what changed in the markup:")
print(changed(before6, markup), "        ")
console.log(
  "\n  The host mutated nothing. It sent a string and an empty array, the plugin\n" +
    "  ran a closure that never left its side of the boundary, and the answer came\n" +
    "  back as a `setText` mutation that re-rendered the tree.",
)

rule("7. The user types, then presses Enter")
const before7 = [...markup]
console.log(`      [user]   input on <input#node-9>, value now "beta"`)
await host.dispatch("node-9", "input", {
  type: "input",
  target: { value: "beta" },
  preventDefault: () => {},
})
print(changed(before7, markup), "        ")
console.log(
  "\n  Note what crossed: the string \"beta\", not the input element. The plugin\n" +
    "  decided a row no longer matched and answered with a `removeChild`.",
)

const before7b = [...markup]
console.log(`\n      [user]   keydown Enter on <input#node-9> (with Meta held)`)
await host.dispatch("node-9", "keydown", {
  type: "keydown",
  key: "Enter",
  code: "Enter",
  altKey: false,
  ctrlKey: false,
  metaKey: true,
  shiftKey: false,
  target: { value: "beta" },
  preventDefault: () => {},
})
print(changed(before7b, markup), "        ")
console.log(
  "\n  Six fields, chosen by name. `serializeKeyboardEvent` is the only place a\n" +
    "  keyboard event's shape is decided, and `packages/protocol/src/events.ts`\n" +
    "  declares the matching `KeyDownEvent` so a native host sends the same six.",
)

rule("8. Submit — the one event the host handles before the plugin hears about it")
let defaultPrevented = false
await host.dispatch("node-6", "submit", {
  type: "submit",
  target: { tagName: "FORM" },
  preventDefault: () => {
    defaultPrevented = true
  },
})
console.log(`      [host]   event.preventDefault() called: ${defaultPrevented}`)
console.log(
  "  Without it the browser navigates and the plugin's tree is gone before\n" +
    "  executeHandler resolves. Every other event is passed through untouched.",
)

rule("9. The type this host has never heard of")
const unknownLine = markup.find((l) => l.includes("uniview-unknown"))
console.log(`  ${unknownLine?.trim()}`)
console.log(
  `  registry.list() -> [${host.registry.list().join(", ")}]\n` +
    `  registry.has("Sparkline") -> ${host.registry.has("Sparkline")}`,
)
console.log(
  "  The subtree was not dropped and nothing threw. Register it and the SAME\n" +
    "  renderer draws it — the renderer never changed:",
)
const Sparkline: MarkupComponent = (props) => {
  const raw = props.values
  const values = Array.isArray(raw) ? raw.filter((v): v is number => typeof v === "number") : []
  const glyphs = "▁▂▃▄▅▆▇█"
  const max = Math.max(1, ...values)
  const bars = values
    .map((v) => glyphs[Math.min(glyphs.length - 1, Math.round((v / max) * 7))])
    .join("")
  return [`<Sparkline>${bars}</Sparkline>`]
}
host.registry.register("Sparkline", Sparkline)
await controller.syncTree()
console.log(`  ${markup.find((l) => l.includes("Sparkline"))?.trim()}`)

rule("10. The finished frame")
print(markup)

rule("11. What this host actually is")
console.log(
  `  errors surfaced through subscribeErrors : ${errors.length}\n` +
    `  status                                  : ${JSON.stringify(controller.getStatus())}\n` +
    `  markup lines                            : ${markup.length}\n` +
    `  listeners currently attached            : ${host.listeners().length}`,
)
console.log(
  "\n  One recursive function, seven branches, a prop transformer, and a\n" +
    "  per-event serializer. That is the whole of a web host adapter. Swap the\n" +
    "  markup for `<svelte:element>` and you have ComponentRenderer.svelte; swap\n" +
    "  it for `createElement` and you have the React host; for `h()` and you have\n" +
    "  Vue. Step 09 does exactly that, twice, and the branches do not move.",
)

unsubscribe()
unsubscribeErrors()
await controller.destroy()
