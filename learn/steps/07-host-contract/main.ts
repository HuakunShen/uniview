/**
 * Step 07 — The host contract.
 *
 * Stage C opens here. Step 02 built the one operation every host performs:
 * fold a batch of `Mutation`s into a `UINode` tree. That is necessary and it is
 * nowhere near sufficient. A `MutableTree` sitting in a variable draws nothing.
 *
 * This step is the *seam* around it — the two interfaces a new host implements,
 * and the three things a host is forbidden to assume.
 *
 *   1. `PluginController` — what the host CALLS. connect / disconnect /
 *      updateProps / executeHandler / destroy / syncTree / getStatus, plus
 *      getTree / subscribe. Note the direction: the host does not read the
 *      plugin, it subscribes to it and calls back into it. Stage D (steps
 *      12-14) implements this same interface three ways — main thread, Web
 *      Worker, WebSocket — and the host code above it does not change a line.
 *      "All controllers implement `PluginController` - host code unchanged when
 *      switching modes." (CLAUDE.md, packages/host-sdk)
 *
 *   2. `ComponentRegistry` — how a host maps a node `type` to something it can
 *      draw. It lives in the HOST, not in the protocol, because the protocol
 *      keeps `type` a bare `string` on purpose: a product adds a primitive
 *      without touching `@uniview/protocol`. The price of that freedom is that
 *      an unknown `type` is a runtime fact in the host, not a compile error in
 *      the plugin — so every host needs a fallback, and receiving a type it has
 *      never heard of is the NORMAL case, not an error case.
 *
 * And what a host must never assume, straight out of `CLAUDE.md`'s prime
 * directive:
 *
 *   "The renderer must not know what a 'sidebar', a 'launcher' or a 'command
 *    palette' is. Those are components, and components are written in the
 *    plugin, in TypeScript."
 *
 *   "The renderer must not contain a color, a gradient, a corner radius or a
 *    shadow that it invented."
 *
 * To make all of that unavoidable rather than merely stated, this file builds
 * TWO hosts against one contract:
 *
 *   Host A "outline" — recursive, one function per node, output is a string
 *                      tree. This is the web hosts' idiom (Svelte / Vue /
 *                      React each render a component per node).
 *   Host B "grid"    — iterative, output is a flat list of absolutely
 *                      positioned draw commands painted into a character grid.
 *                      This is the terminal / AppKit idiom (lay out, then
 *                      mount).
 *
 * They share zero rendering code — only the contract. Both subscribe to the
 * SAME controller, so they receive the very same tree object, and both are
 * shown side by side. One of them knows a `badge` and not a `sparkline`; the
 * other knows a `sparkline` and not a `badge`. Neither drops what it does not
 * know.
 */

// ---------------------------------------------------------------------------
// 1. Carried forward from steps 01-02 — the protocol, unchanged
// ---------------------------------------------------------------------------
//
// Steps never import each other; each directory stands alone. Sections 1-2 are
// step 02's definitions with the long commentary trimmed. If you did step 02
// you can skim to section 3 — nothing about the protocol or the applier
// changed.

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

/** A subset of the real 40-entry `LAYOUT_TAGS`. */
const LAYOUT_TAGS = ["div", "span", "button", "input", "p", "ul", "li"] as const
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

const isTextUINode = (node: UINode | string): node is UINode & { text: string } =>
  typeof node !== "string" && node.type === TEXT_NODE_TYPE

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

/** Step 01/02's printer — used once, to show the ONE tree both hosts receive. */
function show(node: UINode | string, depth = 0): string {
  const pad = "  ".repeat(depth)
  if (typeof node === "string") return `${pad}"${node}" (legacy bare string)`
  if (isTextUINode(node)) return `${pad}#text#${node.id} "${node.text}"`

  const kind = isLayoutTag(node.type) ? "layout tag" : "product primitive"
  const props = Object.entries(node.props)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ")
  const head = `${pad}<${node.type}#${node.id}${props ? " " + props : ""}>  // ${kind}`
  return [head, ...node.children.map((c) => show(c, depth + 1))].join("\n")
}

const text = (id: string, content: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: content,
})

/** Byte size on the wire. UTF-8, because that is what a socket actually carries. */
const bytes = (value: string): number => new TextEncoder().encode(value).length

// ---------------------------------------------------------------------------
// 2. Carried forward from step 02 — MutableTree, verbatim
// ---------------------------------------------------------------------------

/**
 * Two indexes (`id -> node`, `id -> parentId`), six cases, never mutates a node
 * in place. See step 02 for why each of those is load-bearing. Nothing here is
 * new; it is included because a controller owns one and this file needs a
 * working controller.
 */
class MutableTree {
  private tree: UINode | null = null
  private nodeIndex: Map<string, UINode> = new Map()
  private parentIndex: Map<string, string> = new Map()
  private readonly onError: (message: string) => void

  constructor(onError: (message: string) => void = (m) => console.error(m)) {
    this.onError = onError
  }

  init(tree: UINode | null): void {
    this.tree = tree
    this.rebuildIndex()
  }

  getTree(): UINode | null {
    return this.tree
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
// 3. NEW — ComponentRegistry: the host's `type` -> "something I can draw" map
// ---------------------------------------------------------------------------

/**
 * Same shape as the real `ComponentRegistry<T>`: five methods, generic in `T`
 * because what a "component" IS differs completely per host. In Svelte `T` is a
 * `Component`; in React a `ComponentType`; in AppKit a Swift `Component`
 * protocol producing an `NSView`. Here host A's `T` renders lines of text and
 * host B's `T` emits draw commands. The registry does not care — that is the
 * point of the type parameter.
 *
 * Note where this type lives: `@uniview/host-sdk`, NOT `@uniview/protocol`. The
 * protocol deliberately knows nothing about drawing, and "MUST NOT define
 * product-specific components (Button, Card, etc.) - keep protocol agnostic".
 * The registry is the host's private business.
 */
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

/**
 * The whole implementation, matching the real one: a `Map`, and `get` returns
 * `undefined` for an unknown type rather than throwing. The `undefined` is the
 * interesting part — it is what forces every host to have a fallback branch.
 */
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

// ---------------------------------------------------------------------------
// 4. NEW — PluginController: the seam Stage D implements three times
// ---------------------------------------------------------------------------

/** Where the plugin runs. The host's only visible clue that a boundary exists. */
export type HostMode = "worker" | "websocket" | "main"

/**
 * Copied field-for-field from `packages/host-sdk/src/types.ts`.
 *
 * Read it as an answer to one question: *what does a host need from a plugin it
 * cannot see?* Six verbs and three observations.
 *
 *   connect / disconnect / destroy  lifecycle. `destroy` exists separately from
 *                                   `disconnect` because a controller may hold
 *                                   resources (a Worker, a socket) that outlive
 *                                   one connection.
 *   updateProps                     props flow DOWN from the host app into the
 *                                   plugin's root component.
 *   executeHandler                  events flow UP. A `HandlerId` string, not a
 *                                   function, because a function cannot survive
 *                                   structured clone (step 13).
 *   syncTree                        "resend everything". The escape hatch for
 *                                   the drift step 02 could only report.
 *   getTree / subscribe             the host reads the tree by SUBSCRIBING, not
 *                                   by polling. `subscribe` returns its own
 *                                   unsubscribe function, and the subscriber
 *                                   set is why two hosts can watch one plugin.
 *   getStatus                       `{ mode, connected, lastError }` — the only
 *                                   place a host learns where the plugin runs,
 *                                   and it is deliberately three fields wide.
 *
 * Every method is `Promise`-returning even in main-thread mode where nothing is
 * async. That uniformity is the whole trick: the host writes `await
 * controller.executeHandler(id)` and never finds out whether that crossed a
 * thread, a process, or nothing at all.
 */
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
  /** Optional in the real interface — not every transport can report plugin errors. */
  subscribeErrors?(cb: (message: string) => void): () => void
}

// ---------------------------------------------------------------------------
// 5. A stand-in controller, so the seam has something behind it
// ---------------------------------------------------------------------------

/**
 * NOT a real controller. Stage D builds those: `createMainController` renders a
 * React tree in the same page, `createWorkerController` speaks kkrpc over
 * `postMessage`, `createWebSocketController` over a socket. All three fill in
 * exactly the interface above.
 *
 * This one replays a script. What matters is that it is indistinguishable from
 * the real ones *to a host*, because the interface is the only thing a host is
 * allowed to see. Note the two details it copies from production:
 *
 *   - a `Set` of subscribers, fanned out on every batch (multiple subscribers
 *     are supported — this file has two);
 *   - `new MutableTree()` on disconnect, so a stale index cannot survive a
 *     reconnect.
 */
class ScriptedController implements PluginController {
  private tree = new MutableTree((m) => this.reportError(m))
  private current: UINode | null = null
  private isConnected = false
  private lastError: string | undefined
  private lastProps: JSONValue = null
  private readonly subscribers = new Set<(tree: UINode | null) => void>()
  private readonly errorSubscribers = new Set<(message: string) => void>()

  /** The scripted plugin: first frame, plus a batch per handler id. */
  constructor(
    private readonly firstFrame: Mutation[],
    private readonly handlerScript: Record<string, Mutation[]>,
  ) {}

  async connect(): Promise<void> {
    this.isConnected = true
    this.apply(this.firstFrame)
  }

  async disconnect(): Promise<void> {
    this.isConnected = false
    this.current = null
    // A fresh applier: an index built against the old connection's tree must
    // never be reused after a reconnect.
    this.tree = new MutableTree((m) => this.reportError(m))
    this.notify()
  }

  async destroy(): Promise<void> {
    await this.disconnect()
    this.subscribers.clear()
    this.errorSubscribers.clear()
  }

  async updateProps(props: JSONValue): Promise<void> {
    // Props travel DOWN. In a real controller this is an RPC into the plugin,
    // which re-renders and emits a mutation batch back.
    this.lastProps = props
  }

  async executeHandler(handlerId: HandlerId, args?: JSONValue[]): Promise<void> {
    if (!this.isConnected) return
    const batch = this.handlerScript[handlerId]
    if (!batch) {
      // An id the plugin no longer knows. Report, never throw — the host must
      // survive a plugin it does not control (step 02's rule, one level up).
      this.reportError(`[uniview] no handler registered for ${handlerId}`)
      return
    }
    void args
    this.apply(batch)
  }

  async syncTree(): Promise<void> {
    // "Request plugin to send current full tree / Used for recovery from drift
    // or explicit sync request." Here, as in the real main-thread controller,
    // that is just a re-notify of every subscriber.
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

  /** Teaching-only: stands in for "the plugin emitted a batch on its own". */
  emit(mutations: Mutation[]): void {
    if (!this.isConnected) return
    this.apply(mutations)
  }

  /** Teaching-only: proves `updateProps` landed somewhere. */
  propsSeen(): JSONValue {
    return this.lastProps
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
// 6. Shared vocabulary the CONTRACT gives every host (not shared code)
// ---------------------------------------------------------------------------

/**
 * `_onClickHandlerId: "h_1"` -> `"click"`. The real protocol exports
 * `isHandlerIdProp` / `extractEventName` against a whitelist of eleven event
 * names; this is the two-line version.
 *
 * Both hosts need this, and both get it from the PROTOCOL, not from each other.
 * That distinction is the whole of "they share zero rendering code": they share
 * the way a node is *described*, never the way it is *drawn*.
 */
const handlerEventName = (propKey: string): string | null => {
  const match = /^_on([A-Z][A-Za-z]*)HandlerId$/.exec(propKey)
  return match ? match[1].toLowerCase() : null
}

/** The Style IR arrives under `_style`. Step 16 is the real treatment. */
const styleColorToken = (node: UINode): string | null => {
  const style = node.props._style
  if (style === null || typeof style !== "object" || Array.isArray(style)) return null
  const color = (style as Record<string, JSONValue>).color
  return typeof color === "string" ? color : null
}

/** Read a child's text whether it is a v3 text node or a legacy bare string. */
const textContent = (node: UINode | string): string | null => {
  if (typeof node === "string") return node
  if (node.type === TEXT_NODE_TYPE) return node.text ?? ""
  return null
}

// ---------------------------------------------------------------------------
// 7. HOST A — "outline": recursive, one function per node, output is a string tree
// ---------------------------------------------------------------------------

/**
 * What a "component" is, for host A. Lines of markup.
 *
 * `ctx` is everything the host already computed for this node so a component
 * does not have to re-walk it: serialized attributes, the children the host
 * already rendered, and the flattened text for components that render inline.
 */
interface OutlineCtx {
  attrs: string
  childLines: string[]
  childText: string
}
type OutlineComponent = (node: UINode, ctx: OutlineCtx) => string[]

function createOutlineHost(): {
  name: string
  registry: ComponentRegistry<OutlineComponent>
  render: (tree: UINode | null) => string[]
  helpers: Function[]
  /** The host's built-in primitives, mirroring AppKit's `ComponentRegistry.standard()`. */
  components: { container: OutlineComponent; badge: OutlineComponent }
} {
  const registry = createComponentRegistry<OutlineComponent>()

  /**
   * THE BRAND-AGNOSTIC RULE, in code. The plugin said `color: "accent"`. The
   * host resolves that semantic token to *its own environment's* value — here a
   * CSS custom property the page owns. It does not resolve to a hex literal,
   * because a hex literal in a renderer is a brand the renderer invented.
   */
  function resolveColor(token: string): string {
    return `var(--${token})`
  }

  function serializeAttrs(node: UINode): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(node.props)) {
      if (key === "_style") continue // handled below, not an attribute
      const event = handlerEventName(key)
      if (event !== null) {
        // A handler prop is not an attribute — it is a call back into the
        // plugin. Host A binds it; host B marks it. Same prop, two readings.
        parts.push(`on:${event}=${JSON.stringify(value)}`)
        continue
      }
      parts.push(`${key}=${JSON.stringify(value)}`)
    }
    const token = styleColorToken(node)
    if (token !== null) parts.push(`style="color: ${resolveColor(token)}"`)
    return parts.length > 0 ? " " + parts.join(" ") : ""
  }

  function flattenText(node: UINode): string {
    return node.children.map((c) => textContent(c) ?? "").join("")
  }

  const indent = (lines: string[]): string[] => lines.map((l) => "  " + l)

  /**
   * The generic container. `column`, `Sidebar` and `CommandPalette` are all
   * registered to THIS ONE FUNCTION — the host has no idea they differ, which
   * is exactly what "the renderer must not know what a 'sidebar' is" means in
   * practice.
   */
  const container: OutlineComponent = (node, ctx) => [
    `<${node.type}${ctx.attrs}>`,
    ...indent(ctx.childLines),
    `</${node.type}>`,
  ]

  /** A product primitive host A knows and host B does not. */
  const badge: OutlineComponent = (node, ctx) => [
    `<badge${ctx.attrs}>${ctx.childText}</badge>`,
  ]

  function renderNode(node: UINode | string): string[] {
    // 1. Bare string children. "NEVER drop text children" is a listed
    //    anti-pattern; a legacy string has no id and no mutation can address
    //    it, but it still has to appear.
    if (typeof node === "string") return [node]

    // 2. Text nodes.
    if (isTextUINode(node)) return [node.text]

    const ctx: OutlineCtx = {
      attrs: serializeAttrs(node),
      childLines: node.children.flatMap(renderNode),
      childText: flattenText(node),
    }

    // 3. Layout tags. Guaranteed by the protocol and append-only by policy
    //    ("NEVER remove LAYOUT_TAGS — hosts may rely on existing tags"), so a
    //    host may hardcode them. Everything else may not be hardcoded.
    if (isLayoutTag(node.type)) {
      if (ctx.childLines.length === 0) return [`<${node.type}${ctx.attrs} />`]
      return [
        `<${node.type}${ctx.attrs}>`,
        ...indent(ctx.childLines),
        `</${node.type}>`,
      ]
    }

    // 4. Product primitives, via the registry.
    const component = registry.get(node.type)
    if (component) return component(node, ctx)

    // 5. Fallback. A type from a plugin this host does not control. NOT an
    //    error — visible, never silently dropped.
    return [`Unknown: ${node.type}`]
  }

  return {
    name: "outline host (string tree, recursive)",
    registry,
    components: { container, badge },
    render: (tree) => (tree ? renderNode(tree) : ["(no tree)"]),
    helpers: [resolveColor, serializeAttrs, flattenText, container, badge, renderNode],
  }
}

// ---------------------------------------------------------------------------
// 8. HOST B — "grid": iterative, output is draw commands painted into cells
// ---------------------------------------------------------------------------

/**
 * Host B never builds a string tree. It computes a flat list of absolutely
 * positioned draw commands and then paints them, which is what the terminal
 * host and the AppKit mounter actually do (lay out, then mount / paint).
 *
 * If you are looking for the sentence that justifies stage C: these two hosts
 * consume the same `UINode` and share not one line of the code below with
 * section 7.
 */
type DrawCmd =
  | { op: "box"; row: number; col: number; width: number; height: number; label: string }
  | { op: "text"; row: number; col: number; text: string }
  | { op: "mark"; row: number; col: number; ch: string }

interface Block {
  cmds: DrawCmd[]
  height: number
}

interface GridCtx {
  stack(children: (UINode | string)[], row: number, col: number, width: number): Block
  accentPrefix(node: UINode): string
}
type GridComponent = (
  node: UINode,
  row: number,
  col: number,
  width: number,
  ctx: GridCtx,
) => Block

const GRID_WIDTH = 40

function createGridHost(): {
  name: string
  registry: ComponentRegistry<GridComponent>
  render: (tree: UINode | null) => string[]
  lastCommands: () => DrawCmd[]
  helpers: Function[]
  components: { container: GridComponent; sparkline: GridComponent }
} {
  const registry = createComponentRegistry<GridComponent>()
  let commands: DrawCmd[] = []

  /**
   * The same brand-agnostic rule, resolved into a completely different
   * environment. A character grid has no CSS variables; it has the palette the
   * user configured in their terminal. Neither host writes a hex literal.
   */
  function resolveColor(token: string): string {
    return `terminal palette slot for "${token}"`
  }

  function accentPrefix(node: UINode): string {
    return styleColorToken(node) !== null ? "~" : ""
  }

  /** Joined text of a node's children, or null if any child is an element. */
  function inlineText(node: UINode): string | null {
    let out = ""
    for (const child of node.children) {
      const content = textContent(child)
      if (content === null) return null
      out += content
    }
    return out
  }

  function handlerIdOf(node: UINode): string | null {
    for (const key of Object.keys(node.props)) {
      if (handlerEventName(key) !== null) return key
    }
    return null
  }

  function stack(
    children: (UINode | string)[],
    row: number,
    col: number,
    width: number,
  ): Block {
    const cmds: DrawCmd[] = []
    let r = row
    for (const child of children) {
      const block = layoutNode(child, r, col, width)
      cmds.push(...block.cmds)
      r += block.height
    }
    return { cmds, height: r - row }
  }

  function layoutNode(
    node: UINode | string,
    row: number,
    col: number,
    width: number,
  ): Block {
    // 1. Bare strings — same rule, different code.
    if (typeof node === "string") {
      return { cmds: [{ op: "text", row, col, text: node }], height: 1 }
    }

    // 2. Text nodes.
    if (isTextUINode(node)) {
      return { cmds: [{ op: "text", row, col, text: node.text }], height: 1 }
    }

    // 3. Layout tags — host B's built-in path.
    if (isLayoutTag(node.type)) {
      const inline = inlineText(node)
      if (inline !== null) {
        const cmds: DrawCmd[] = [
          {
            op: "text",
            row,
            col,
            text: `${accentPrefix(node)}[${node.type}] ${inline}`,
          },
        ]
        // A handler prop becomes a hit-target marker, not an event binding.
        if (handlerIdOf(node) !== null) {
          cmds.push({ op: "mark", row, col: col + width - 1, ch: "*" })
        }
        return { cmds, height: 1 }
      }
      return stack(node.children, row, col, width)
    }

    // 4. Product primitives, via host B's OWN registry.
    const component = registry.get(node.type)
    if (component) return component(node, row, col, width, { stack, accentPrefix })

    // 5. Fallback — the same visible placeholder, independently arrived at.
    return {
      cmds: [{ op: "text", row, col, text: `Unknown: ${node.type}` }],
      height: 1,
    }
  }

  /** Host B's generic container: a labelled box with its children inside. */
  const gridContainer: GridComponent = (node, row, col, width, ctx) => {
    const inner = ctx.stack(node.children, row + 1, col + 2, width - 4)
    const height = inner.height + 2
    return {
      cmds: [{ op: "box", row, col, width, height, label: node.type }, ...inner.cmds],
      height,
    }
  }

  /** A product primitive host B knows and host A does not. */
  const sparkline: GridComponent = (node, row, col) => {
    const raw = node.props.values
    const values = Array.isArray(raw) ? raw.filter((v) => typeof v === "number") : []
    const glyphs = "▁▂▃▄▅▆▇█"
    const max = Math.max(1, ...values)
    const bars = values
      .map((v) => glyphs[Math.min(glyphs.length - 1, Math.round((v / max) * 7))])
      .join("")
    return { cmds: [{ op: "text", row, col, text: bars }], height: 1 }
  }

  function paint(cmds: DrawCmd[], width: number, height: number): string[] {
    const rows: string[][] = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => " "),
    )
    const put = (r: number, c: number, s: string): void => {
      if (r < 0 || r >= height) return
      for (let i = 0; i < s.length; i++) {
        const col = c + i
        if (col < 0 || col >= width) return
        rows[r][col] = s[i]
      }
    }
    for (const cmd of cmds) {
      if (cmd.op === "text") {
        put(cmd.row, cmd.col, cmd.text)
      } else if (cmd.op === "mark") {
        put(cmd.row, cmd.col, cmd.ch)
      } else {
        const innerWidth = Math.max(0, cmd.width - 2)
        const label = ` ${cmd.label} `
        const bar = label + "─".repeat(Math.max(0, innerWidth - label.length))
        put(cmd.row, cmd.col, "┌" + bar + "┐")
        for (let r = cmd.row + 1; r < cmd.row + cmd.height - 1; r++) {
          put(r, cmd.col, "│")
          put(r, cmd.col + cmd.width - 1, "│")
        }
        put(cmd.row + cmd.height - 1, cmd.col, "└" + "─".repeat(innerWidth) + "┘")
      }
    }
    return rows.map((r) => r.join("").trimEnd())
  }

  return {
    name: "grid host (draw commands, iterative)",
    registry,
    components: { container: gridContainer, sparkline },
    lastCommands: () => commands,
    render: (tree) => {
      if (!tree) return ["(no tree)"]
      const block = layoutNode(tree, 0, 0, GRID_WIDTH)
      commands = block.cmds
      return paint(block.cmds, GRID_WIDTH, block.height)
    },
    helpers: [
      resolveColor,
      accentPrefix,
      inlineText,
      handlerIdOf,
      stack,
      layoutNode,
      gridContainer,
      sparkline,
      paint,
    ],
  }
}

// ---------------------------------------------------------------------------
// 9. Wiring — one controller, two subscribers
// ---------------------------------------------------------------------------

// Step 01's frame-1 tree, byte for byte.
const treeV1: UINode = {
  id: "n1",
  type: "column",
  props: { gap: 8, padding: 16 },
  children: [
    text("n2", "Clicked 0 times"),
    {
      id: "n3",
      type: "button",
      props: { disabled: true, _onClickHandlerId: "h_1" },
      children: [text("n4", "Click me")],
    },
  ],
}

// Step 02's exact three mutations — now arriving as the RESULT of the host
// calling `executeHandler("h_1")`. That round trip is what the controller
// interface exists for.
const clickBatch: Mutation[] = [
  { type: "setText", nodeId: "n2", text: "Clicked 1 times" },
  {
    type: "setProps",
    nodeId: "n3",
    props: { disabled: false, _onClickHandlerId: "h_1" },
  },
  { type: "appendChild", parentId: "n1", node: text("n5", "last click: just now") },
]

// Stage C's addendum: two product primitives from a plugin neither host wrote,
// plus a Style IR token on the button.
const primitivesBatch: Mutation[] = [
  {
    type: "appendChild",
    parentId: "n1",
    node: {
      id: "n6",
      type: "badge",
      props: { tone: "info" },
      children: [text("n7", "synced")],
    },
  },
  {
    type: "appendChild",
    parentId: "n1",
    node: {
      id: "n8",
      type: "sparkline",
      props: { values: [1, 3, 5, 7, 5, 2] },
      children: [],
    },
  },
  {
    type: "setProps",
    nodeId: "n3",
    props: {
      disabled: false,
      _onClickHandlerId: "h_1",
      _style: { color: "accent" },
    },
  },
]

const controller: PluginController = new ScriptedController(
  [{ type: "setRoot", node: treeV1 }],
  { h_1: clickBatch },
)
const scripted = controller as ScriptedController

const hostA = createOutlineHost()
const hostB = createGridHost()

// --- each host populates ITS OWN registry, from the application layer -------
//
// This is the app talking, not the renderer. Both hosts ship a generic
// container primitive; `column`, `Sidebar` and `CommandPalette` are three NAMES
// the app pointed at host A's single container function. The host cannot tell
// them apart and must not try. `ComponentMetadata` is accepted here and stored
// — note that the real interface has no way to read it back.
hostA.registry.register("column", hostA.components.container, { version: "1.0.0" })
hostA.registry.register("Sidebar", hostA.components.container)
hostA.registry.register("CommandPalette", hostA.components.container)
hostA.registry.register("badge", hostA.components.badge)

hostB.registry.register("column", hostB.components.container)
hostB.registry.register("sparkline", hostB.components.sparkline)

// --- both hosts subscribe to the SAME controller ---------------------------
let framesA = 0
let framesB = 0
let renderA: string[] = []
let renderB: string[] = []
let treeSeenByA: UINode | null = null
let treeSeenByB: UINode | null = null

const unsubA = controller.subscribe((tree) => {
  framesA++
  treeSeenByA = tree
  renderA = hostA.render(tree)
})
const unsubB = controller.subscribe((tree) => {
  framesB++
  treeSeenByB = tree
  renderB = hostB.render(tree)
})

const hostErrors: string[] = []
const unsubErr = controller.subscribeErrors?.((m) => hostErrors.push(m)) ?? (() => {})

// ---------------------------------------------------------------------------
// 10. Printing helpers
// ---------------------------------------------------------------------------

function sideBySide(
  left: { title: string; lines: string[] },
  right: { title: string; lines: string[] },
): string {
  const width = Math.max(left.title.length, ...left.lines.map((l) => l.length)) + 3
  const rows = Math.max(left.lines.length, right.lines.length)
  const out = [
    left.title.padEnd(width) + right.title,
    "-".repeat(width - 3).padEnd(width) + "-".repeat(right.title.length),
  ]
  for (let i = 0; i < rows; i++) {
    out.push(((left.lines[i] ?? "") as string).padEnd(width) + (right.lines[i] ?? ""))
  }
  return out.map((l) => "  " + l.trimEnd()).join("\n")
}

const frame = (): { a: { title: string; lines: string[] }; b: { title: string; lines: string[] } } => ({
  a: { title: "HOST A — " + hostA.name, lines: renderA },
  b: { title: "HOST B — " + hostB.name, lines: renderB },
})

// ---------------------------------------------------------------------------
// 11. Run it
// ---------------------------------------------------------------------------

console.log("=== 1. Before connect(): the contract exists, the plugin does not ===")
console.log(`  getStatus() -> ${JSON.stringify(controller.getStatus())}`)
console.log(`  getTree()   -> ${JSON.stringify(controller.getTree())}`)
console.log("  registries:")
console.log(`    host A knows: [${hostA.registry.list().join(", ")}]`)
console.log(`    host B knows: [${hostB.registry.list().join(", ")}]`)

await controller.connect()

console.log("\n=== 2. connect() — one tree, two renderings ===")
console.log("\n  the ONE tree both hosts received:")
console.log(
  (controller.getTree() ? show(controller.getTree() as UINode) : "")
    .split("\n")
    .map((l) => "    " + l)
    .join("\n"),
)
console.log()
console.log(sideBySide(frame().a, frame().b))

// --- the event round trip --------------------------------------------------
//
// The host does not mutate anything. It calls back into the plugin with the
// handler id it found in the props, and the plugin answers with mutations.
console.log("\n=== 3. executeHandler('h_1') — events go UP, mutations come back DOWN ===")
await controller.executeHandler("h_1", [{ kind: "click" }])
console.log("  the plugin answered with step 02's exact three mutations.")
console.log()
console.log(sideBySide(frame().a, frame().b))

// --- registry divergence ---------------------------------------------------
console.log("\n=== 4. Two product primitives neither host wrote ===")
scripted.emit(primitivesBatch)
console.log("  <badge> — host A has it registered, host B does not")
console.log("  <sparkline> — host B has it registered, host A does not")
console.log()
console.log(sideBySide(frame().a, frame().b))
console.log(
  "\n  Neither host dropped the type it did not know, and neither threw. An\n" +
    "  unknown `type` is the NORMAL case: the plugin ships its own primitives\n" +
    "  and the host learns about them at runtime or not at all.",
)

// Snapshot the fully-populated frame; sections 7 and 8 disconnect the plugin.
const finalA = [...renderA]
const finalB = [...renderB]
const finalCommands = hostB.lastCommands()

// --- what each host actually produced --------------------------------------
console.log("\n=== 5. The two hosts do not produce the same KIND of thing ===")
console.log("  host A's output IS the rendering — nested markup, built recursively:")
for (const line of finalA.slice(0, 3)) console.log(`    ${JSON.stringify(line)}`)
console.log(`    ... ${finalA.length} lines total`)
console.log("\n  host B's output is a flat command list; the picture is painted after:")
for (const cmd of finalCommands.slice(0, 5)) {
  console.log(`    ${JSON.stringify(cmd)}`)
}
console.log(`    ... ${finalCommands.length} commands total`)

// --- the three things a host may not assume --------------------------------
console.log("\n=== 6. What a host must NEVER assume ===")

console.log("\n  (a) that it is a DOM")
console.log(`      typeof document at render time: ${typeof document}`)
console.log(
  "      Host B painted a character grid. AppKit paints NSViews from Swift with\n" +
    "      no JS runtime at all. Nothing in `UINode` mentions an element.",
)

console.log('\n  (b) that it knows what a "sidebar" is')
console.log(
  `      hostA.registry.get("Sidebar") === hostA.registry.get("CommandPalette") -> ` +
    `${hostA.registry.get("Sidebar") === hostA.registry.get("CommandPalette")}`,
)
console.log(
  "      Both names resolve to the SAME generic container function. The app\n" +
    "      chose the names; the renderer has one code path and no idea they\n" +
    "      differ. That is the prime directive's app-agnostic clause, enforced by\n" +
    "      the registry living in the host and being filled from outside it.",
)

console.log("\n  (c) that it may invent a color")
const token = styleColorToken(
  (controller.getTree() as UINode).children[1] as UINode,
)
console.log(`      the plugin sent the semantic token: ${JSON.stringify(token)}`)
console.log(`      host A resolved it to: var(--accent)          (the page's variable)`)
console.log(`      host B resolved it to: terminal palette slot   (the user's theme)`)
const hexInOutput = /#[0-9a-fA-F]{6}\b/
console.log(
  `      hex literals in either rendering: ` +
    `${[...renderA, ...renderB].filter((l) => hexInOutput.test(l)).length}`,
)

// --- lifecycle, status, drift ----------------------------------------------
console.log("\n=== 7. The rest of the interface ===")
await controller.updateProps({ theme: "compact" })
console.log(`  updateProps({theme:"compact"}) — plugin now holds ${JSON.stringify(scripted.propsSeen())}`)

const beforeSync = { a: framesA, b: framesB }
await controller.syncTree()
console.log(
  `  syncTree() — re-notified both subscribers: A ${beforeSync.a}->${framesA}, ` +
    `B ${beforeSync.b}->${framesB}`,
)
console.log(
  "    This is the drift recovery step 02 could only report and never repair:\n" +
    "    a host that has diverged asks for the whole tree again.",
)

await controller.executeHandler("h_ghost")
console.log(`  executeHandler("h_ghost") on an unknown id — host still alive.`)
console.log(`  errors surfaced through subscribeErrors: ${hostErrors.length}`)
for (const e of hostErrors) console.log(`    - ${e}`)
console.log(`  getStatus() -> ${JSON.stringify(controller.getStatus())}`)

await controller.disconnect()
console.log(`  after disconnect(): ${JSON.stringify(controller.getStatus())}`)
console.log(`  both hosts re-rendered the empty tree: A "${renderA[0]}" / B "${renderB[0]}"`)

// ---------------------------------------------------------------------------
// 12. The summary this whole step exists to print
// ---------------------------------------------------------------------------

unsubA()
unsubB()
unsubErr()
await controller.destroy()

// Each host's `helpers` array holds the ACTUAL functions it renders with, so
// the comparison below is computed from real function objects, not asserted.
const helpersA = hostA.helpers
const helpersB = hostB.helpers
const namesA = helpersA.map((f) => f.name)
const namesB = helpersB.map((f) => f.name)
const sharedNames = namesA.filter((n) => namesB.includes(n))
const sharedImplementations = helpersA.filter((f) => helpersB.includes(f))

console.log("\n=== 8. Same input, two hosts, zero shared rendering code ===")
console.log(`  mutation batches emitted by the plugin  : 3`)
console.log(`  frames delivered to host A / host B     : ${framesA} / ${framesB}`)
console.log(
  `  both hosts received the same tree OBJECT: ` +
    `${treeSeenByA === treeSeenByB}  (one subscriber Set, one fan-out)`,
)
console.log(
  `  final rendering: A ${finalA.length} lines / ${bytes(finalA.join("\n"))} bytes, ` +
    `B ${finalB.length} lines / ${bytes(finalB.join("\n"))} bytes`,
)
console.log(
  `  rendering functions: A has ${namesA.length}, B has ${namesB.length}\n` +
    `    shared implementations : ${sharedImplementations.length}\n` +
    `    shared names only      : ${sharedNames.length}  [${sharedNames.join(", ")}]`,
)
console.log(
  `  That one name collision is the finding, not a flaw: both hosts had to\n` +
    `  resolve a semantic color token, and each wrote its own — one to a CSS\n` +
    `  variable, one to a terminal palette slot. Same JOB, named the same way,\n` +
    `  zero shared code. Everything they truly share is the contract: UINode,\n` +
    `  Mutation, PluginController, ComponentRegistry, LAYOUT_TAGS,\n` +
    `  TEXT_NODE_TYPE, and section 6's prop readers.`,
)

console.log(
  "\nA new host is: one MutableTree (step 02), one ComponentRegistry, and five\n" +
    "dispatch branches — bare string, text node, layout tag, registry, fallback.\n" +
    "Everything else is that platform's business. Steps 08-11 write four real\n" +
    "ones: Svelte, Vue + React, native AppKit, and a terminal grid.",
)
