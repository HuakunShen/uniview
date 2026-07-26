/**
 * Step 11 — The terminal host: the same tree, as cells in a grid.
 *
 * Stage C closes here. Steps 08-10 kept moving the same `UINode` tree into
 * hosts that were still, underneath, *scene graphs*: Svelte, Vue and React each
 * hand a node to a component and let a retained tree of elements do the drawing;
 * AppKit hands it to an `NSView`. Every one of those hosts can say "this node is
 * that object, patch it".
 *
 * A terminal cannot say that. There is no object. There is a rectangle of
 * character cells, and the only thing you can do to it is write a glyph at a
 * coordinate. Nothing about it resembles a browser — no elements, no boxes that
 * know their own size, no relayout, no repaint invalidation, no `z-index`, no
 * subpixels. If `UINode` + `Mutation` survives THIS host, the claim that the
 * protocol is renderer-independent is not a slogan.
 *
 * So this step builds the whole pipeline the real `TuiRenderer` runs, in
 * miniature and in order:
 *
 *   UINode tree                    (the protocol — unchanged since step 01)
 *     -> RenderNode                (the host's private paintable shape)
 *     -> layout   assign every node an (x, y, width, height) rect in CELLS
 *     -> paint    write glyphs + style ids into a CellBuffer
 *     -> diff     compare against the previous frame's buffer
 *     -> emit     write only the cell runs that actually changed
 *
 * The last two stages are the reason this step exists as much as the first
 * three. A terminal has exactly the problem the RPC boundary had in step 05,
 * one layer down: you can send the whole thing every frame, or you can send what
 * changed. Sending the whole screen every frame is not merely wasteful — on a
 * real terminal it is *visible*, as flicker and tearing, because a full repaint
 * is thousands of bytes streamed over a pty while the terminal is compositing.
 * `diffFrames` is `Mutation` again, applied to pixels instead of nodes.
 *
 * Two constraints on this file, both deliberate:
 *
 *   - **No yoga.** The real `tui-core` can run `yogaLayoutEngine` (native
 *     flexbox via `yoga-layout`) behind a `LayoutEngine` seam, but its DEFAULT
 *     is a hand-written pure-TS flexbox for exactly the reason `learn/` cannot
 *     depend on yoga: "no dependencies; runs in Worker/Deno/Bun". Section 5 is a
 *     deliberately small layout pass — column/row stacking, gap, padding, border
 *     insets, explicit sizes, one flex-grow rule. The doc says what a real
 *     engine adds.
 *   - **No terminal.** No raw mode, no TTY probe, no input, no alternate
 *     screen. The frames are painted into memory and printed as text art, and
 *     the ANSI that a real surface WOULD have written is only measured, never
 *     emitted. This file runs non-interactively and exits on its own.
 */

// ---------------------------------------------------------------------------
// 1. Carried forward from steps 01-02 — the protocol, unchanged
// ---------------------------------------------------------------------------
//
// Steps never import each other; each directory stands alone. If you did step
// 07 you can skim to section 3 — nothing about the protocol changed, and that
// is the entire point of stage C.

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

/** The whole node type: four required fields, one optional. */
export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
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

/** Step 01/02's printer, kept so the run can show the tree that produced a frame. */
function show(node: UINode | string, depth = 0): string {
  const pad = "  ".repeat(depth)
  if (typeof node === "string") return `${pad}"${node}" (legacy bare string)`
  if (node.type === TEXT_NODE_TYPE)
    return `${pad}#text#${node.id} ${JSON.stringify(node.text ?? "")}`

  const props = Object.entries(node.props)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ")
  const head = `${pad}<${node.type}#${node.id}${props ? " " + props : ""}>`
  return [head, ...node.children.map((c) => show(c, depth + 1))].join("\n")
}

/** Byte size on the wire. UTF-8, because that is what a pty actually carries. */
const bytes = (value: string): number => new TextEncoder().encode(value).length

// ---------------------------------------------------------------------------
// 2. MutableTree — the SECOND one, and the first real divergence
// ---------------------------------------------------------------------------

/**
 * Steps 02 and 07 used `@uniview/host-sdk`'s `MutableTree`: two indexes, never
 * mutates a node in place, returns a fresh root object from `applyMutations` so
 * a Svelte `$state` or React `useState` host sees a new reference and
 * re-renders only the path that changed.
 *
 * `packages/host-tui` ships its OWN `MutableTree`, and it is a different class
 * with a different public API — `getRoot` / `getNode` / `parentId` /
 * `applyBatch` / `apply` — that **mutates children arrays in place**:
 *
 *     parent.children.push(mutation.node);
 *
 * That is not a copy-paste accident, it is the terminal host being honest about
 * what it is. Structural sharing exists to let a *framework's* change detection
 * skip subtrees by reference equality. A terminal host has no framework and no
 * reference equality to exploit: after any mutation it re-lays-out and repaints
 * the whole scene into a fresh buffer, and then finds "what changed" by
 * comparing GRIDS, not objects. Cloning the path to the root would buy it
 * nothing and cost an allocation per node per frame.
 *
 * The lesson of stage C in one class: two hosts, same six mutation cases, same
 * move-detach semantics, opposite memory strategies — because the protocol
 * specifies the *result*, never the representation.
 */
class MutableTree {
  private root: UINode | null = null
  private readonly nodes = new Map<string, UINode>()
  private readonly parentOf = new Map<string, string>()

  getRoot(): UINode | null {
    return this.root
  }

  getNode(id: string): UINode | undefined {
    return this.nodes.get(id)
  }

  /** The id of a node's parent, or undefined for the root/unknown nodes. */
  parentId(id: string): string | undefined {
    return this.parentOf.get(id)
  }

  applyBatch(mutations: readonly Mutation[]): void {
    for (const mutation of mutations) this.apply(mutation)
  }

  apply(mutation: Mutation): void {
    switch (mutation.type) {
      case "setRoot":
        if (this.root) this.unindex(this.root)
        this.root = mutation.node
        if (mutation.node) this.index(mutation.node, null)
        return

      case "appendChild": {
        const parent = this.nodes.get(mutation.parentId)
        if (!parent) return
        // Step 02's rule survives the rewrite: append of a known id is a MOVE.
        this.ensureDetached(mutation.node.id)
        parent.children.push(mutation.node)
        this.index(mutation.node, parent.id)
        return
      }

      case "insertBefore": {
        const parent = this.nodes.get(mutation.parentId)
        if (!parent) return
        this.ensureDetached(mutation.node.id)
        const at = parent.children.findIndex(
          (c) => typeof c !== "string" && c.id === mutation.beforeId,
        )
        parent.children.splice(at < 0 ? parent.children.length : at, 0, mutation.node)
        this.index(mutation.node, parent.id)
        return
      }

      case "removeChild": {
        const parent = this.nodes.get(mutation.parentId)
        if (!parent) return
        const at = parent.children.findIndex(
          (c) => typeof c !== "string" && c.id === mutation.nodeId,
        )
        if (at < 0) return
        const [removed] = parent.children.splice(at, 1)
        if (removed && typeof removed !== "string") this.unindex(removed)
        return
      }

      case "setText": {
        const node = this.nodes.get(mutation.nodeId)
        if (node) node.text = mutation.text
        return
      }

      case "setProps": {
        const node = this.nodes.get(mutation.nodeId)
        // Full replacement, never a merge — same as step 02.
        if (node) node.props = mutation.props
        return
      }
    }
  }

  private index(node: UINode, parentId: string | null): void {
    this.nodes.set(node.id, node)
    if (parentId !== null) this.parentOf.set(node.id, parentId)
    else this.parentOf.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") this.index(child, node.id)
    }
  }

  private unindex(node: UINode): void {
    this.nodes.delete(node.id)
    this.parentOf.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") this.unindex(child)
    }
  }

  /** Detach an existing node from its parent and drop its old index entries. */
  private ensureDetached(id: string): void {
    const existing = this.nodes.get(id)
    if (!existing) return
    const parentId = this.parentOf.get(id)
    const parent = parentId !== undefined ? this.nodes.get(parentId) : undefined
    if (parent) {
      const at = parent.children.findIndex(
        (c) => typeof c !== "string" && c.id === id,
      )
      if (at >= 0) parent.children.splice(at, 1)
    }
    this.unindex(existing)
  }
}

// ---------------------------------------------------------------------------
// 3. TuiStyle, borders, and the style table
// ---------------------------------------------------------------------------

/**
 * The host's private layout vocabulary. Note what it is NOT: it is not in
 * `@uniview/protocol`. The protocol carries props; the host decides which prop
 * names it understands as layout. A subset of the real `TuiStyle`, whose own
 * comment reads "A Yoga-flavored, terminal-cell layout + visual style. Lengths
 * are in cells; the layout engine implements a flexbox-compatible subset."
 *
 * The real one also has `position`/`top`/`right`/`bottom`/`left`, percentages,
 * `"auto"`, `flexShrink`, `flexBasis`, `justifyContent`, `alignSelf`, min/max
 * on both axes, `margin`, `rowGap`/`columnGap`, `overflow` and `zIndex`. This
 * file keeps eight properties, which is enough to place boxes and text.
 */
export type InsetsValue =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number }

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

/** Border presets; `true` is shorthand for a single-line border. */
export type BorderValue = boolean | "none" | "single" | "rounded" | "double" | "thick"

export interface TuiStyle {
  flexDirection?: "row" | "column"
  flexGrow?: number
  alignItems?: "start" | "stretch"
  /** In CELLS. Not pixels, not ems — a terminal has exactly one unit. */
  width?: number
  height?: number
  padding?: InsetsValue
  gap?: number
  border?: BorderValue
}

const EMPTY_STYLE: TuiStyle = {}
const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

function resolveInsets(value: InsetsValue | undefined): Insets {
  if (value === undefined) return ZERO_INSETS
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value }
  }
  return {
    top: value.top ?? 0,
    right: value.right ?? 0,
    bottom: value.bottom ?? 0,
    left: value.left ?? 0,
  }
}

/**
 * THE DETAIL WHERE "A CELL GRID IS NOT A DOM" STOPS BEING ABSTRACT.
 *
 * In CSS, `border: 1px solid` is a paint-time decoration on a box that already
 * exists; with `box-sizing: border-box` it does not even change the content
 * area. In a terminal a border is not a decoration, it is **four rows and
 * columns of literal characters** — `┌`, `─`, `│`, `┘` — that occupy cells your
 * content can no longer use. A bordered box 46 cells wide has 44 usable
 * columns, and there is no way to have half a border or a rounded corner that
 * is not literally the character `╭`.
 *
 * The consequence runs backwards into layout: `borderInsets` has to be
 * subtracted during *measurement*, not during painting, or every child inside
 * every bordered panel is two cells too wide and silently clipped. That is why
 * `extents()` in section 5 sums border and padding together — to the layout
 * pass they are the same kind of thing.
 *
 * Six glyphs per preset, copied verbatim from the real `BORDER_PRESETS` (which
 * also carries two half-block "quadrant" presets with per-edge overrides).
 */
export interface BorderGlyphs {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
  horizontal: string
  vertical: string
}

export const BORDER_PRESETS: Record<
  "single" | "rounded" | "double" | "thick",
  BorderGlyphs
> = {
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
  },
  rounded: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
  },
  thick: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
  },
}

/** Resolve a `BorderValue` to its glyph set, or null when there is none. */
function borderGlyphs(value: BorderValue | undefined): BorderGlyphs | null {
  if (value === undefined || value === false || value === "none") return null
  if (value === true) return BORDER_PRESETS.single
  return BORDER_PRESETS[value]
}

/** One cell of inset per bordered side. A terminal border is never 0.5 cells. */
function borderInsets(style: TuiStyle): Insets {
  return borderGlyphs(style.border) ? { top: 1, right: 1, bottom: 1, left: 1 } : ZERO_INSETS
}

/**
 * The per-cell visual attributes. A real terminal cell also carries fg/bg
 * colors; this file keeps three boolean attributes because the run prints plain
 * text and colors would be invisible — but the style ID still participates in
 * the frame diff, which is the part that matters. Two cells are equal only when
 * the GLYPH AND THE STYLE match, so re-styling a character with no change to
 * the character is still a change that must be emitted.
 */
export interface CellStyle {
  bold?: boolean
  dim?: boolean
  inverse?: boolean
}

/**
 * Styles are interned to small integers and stored per cell as a number, not as
 * an object. The buffer is a struct-of-arrays holding one `Uint32Array` of ids;
 * comparing two cells is then two primitive comparisons, which is what makes
 * diffing a 200x60 screen (12,000 cells) cheap enough to do on every frame.
 */
class StyleTable {
  private readonly entries: CellStyle[] = [{}]
  private readonly lookup = new Map<string, number>([["{}", 0]])

  intern(style: CellStyle): number {
    const key = JSON.stringify(style)
    const existing = this.lookup.get(key)
    if (existing !== undefined) return existing
    const id = this.entries.length
    this.entries.push(style)
    this.lookup.set(key, id)
    return id
  }

  get(id: number): CellStyle {
    return this.entries[id] ?? {}
  }

  palette(): readonly CellStyle[] {
    return this.entries
  }
}

// ---------------------------------------------------------------------------
// 4. UINode -> RenderNode: the host's private shape
// ---------------------------------------------------------------------------

/**
 * A `RenderNode` is what the terminal host converts a `UINode` into before it
 * draws anything: layout style plus paintable content. It exists because the
 * renderer must not carry protocol concerns (bare-string children, `#text`
 * nodes, handler-id props) into the paint loop, and the paint loop must not
 * carry drawing concerns back into the protocol.
 *
 * Note `title` / `footer`: text painted INTO a border edge. There is no DOM
 * equivalent — the closest is `<fieldset><legend>`, and it is not close. A
 * terminal panel's title lives in the same cells as its top border, replacing
 * some of the `─` run.
 */
export interface RenderNode {
  id?: string
  type?: string
  style?: TuiStyle
  text?: string
  textStyle?: CellStyle
  borderStyle?: CellStyle
  /** Text drawn into the top border edge (a panel title). */
  title?: string
  titleAlign?: "left" | "center" | "right"
  /** Text drawn into the bottom border edge (e.g. an "N of M" counter). */
  footer?: string
  footerAlign?: "left" | "center" | "right"
  children?: RenderNode[]
}

/**
 * Element types treated as inline text (their text children are flattened).
 *
 * Worth pausing on: this is NOT `LAYOUT_TAGS`, and the terminal host has **no
 * `ComponentRegistry` at all** — step 07 flagged that as one of three different
 * answers to the same question. A terminal has no per-type widget objects to
 * register; every node is either "flatten to a string" or "a box with
 * children", and an unknown `type` falls into the second branch and simply
 * lays out its children. The fallback is structural, not a placeholder.
 */
const TEXT_TYPES = new Set(["text", "span", "p", "strong", "em", "code", "label"])

/** Layout props copied straight through to `TuiStyle`. */
const STYLE_KEYS: readonly (keyof TuiStyle)[] = [
  "flexDirection",
  "flexGrow",
  "alignItems",
  "width",
  "height",
  "padding",
  "gap",
  "border",
]

const TEXT_STYLE_FLAGS: readonly (keyof CellStyle)[] = ["bold", "dim", "inverse"]

function propsToStyle(props: Record<string, JSONValue>): TuiStyle {
  const style: Record<string, unknown> = {}
  for (const key of STYLE_KEYS) {
    const value = props[key]
    if (value !== undefined) style[key] = value
  }
  return style as TuiStyle
}

function propsToTextStyle(props: Record<string, JSONValue>): CellStyle {
  const style: Record<string, unknown> = {}
  for (const flag of TEXT_STYLE_FLAGS) {
    if (props[flag] === true) style[flag] = true
  }
  return style as CellStyle
}

/**
 * Flatten a text-type node's children into one string, recursing through
 * nested elements. The real `joinText` carries a comment explaining why the
 * recursion is not optional: without it `<text><strong>OK</strong></text>`
 * disappears from the visual render while the accessibility/semantics walk
 * still finds it — "a query/render mismatch, not just missing text".
 */
function joinText(node: UINode): string {
  let out = ""
  for (const child of node.children) {
    if (typeof child === "string") {
      out += child
      continue
    }
    out += child.type === TEXT_NODE_TYPE ? child.text ?? "" : joinText(child)
  }
  return out
}

function uinodeToRenderNode(node: UINode | string): RenderNode {
  // 1. Bare string children — still never dropped, three hosts later.
  if (typeof node === "string") return { type: "text", text: node }
  // 2. Text nodes.
  if (node.type === TEXT_NODE_TYPE) return { type: "text", text: node.text ?? "" }

  const style = propsToStyle(node.props)

  // 3. Inline text elements: flatten, measure as one line.
  if (TEXT_TYPES.has(node.type)) {
    return {
      type: "text",
      id: node.id,
      text: joinText(node),
      textStyle: propsToTextStyle(node.props),
      style,
    }
  }

  // 4. Everything else is a box that lays out its children.
  const rendered: RenderNode = {
    type: node.type,
    id: node.id,
    style,
    children: node.children.map(uinodeToRenderNode),
  }
  if (typeof node.props.title === "string") rendered.title = node.props.title
  if (typeof node.props.footer === "string") rendered.footer = node.props.footer
  const titleAlign = node.props.titleAlign
  if (titleAlign === "left" || titleAlign === "center" || titleAlign === "right") {
    rendered.titleAlign = titleAlign
  }
  const footerAlign = node.props.footerAlign
  if (footerAlign === "left" || footerAlign === "center" || footerAlign === "right") {
    rendered.footerAlign = footerAlign
  }
  return rendered
}

// ---------------------------------------------------------------------------
// 5. LAYOUT — give every node a rectangle, in cells
// ---------------------------------------------------------------------------

/**
 * Layout is the stage a web host never has to write. In Svelte/Vue/React the
 * browser owns it; you emit `<div style="display:flex">` and something else
 * decides where things land. Here there is no "something else". If the host
 * does not compute an (x, y, width, height) for a node, that node has no
 * position and cannot be drawn at all.
 *
 * This is a DELIBERATELY SIMPLE pass. It implements, in about 90 lines:
 *
 *   - a main axis (`flexDirection: "column"` default, or `"row"`)
 *   - `gap` between siblings on the main axis
 *   - `padding` and border insets, subtracted at MEASURE time
 *   - explicit `width` / `height` in cells
 *   - intrinsic sizing: a leaf reports its own size via `measure`, a container
 *     sums its children on the main axis and takes the max on the cross axis
 *   - `flexGrow`: leftover main-axis space handed to the growers
 *   - `alignItems: "stretch"` (default) or `"start"` on the cross axis
 *
 * and nothing else. No percentages, no `auto`, no `justifyContent`, no
 * `flexShrink`, no `margin`, no absolute positioning, no `z-index`, no wrapping,
 * no min/max, no text wrapping. The doc lists what a real flexbox engine adds
 * and what it costs.
 *
 * The two-phase shape — `intrinsicSize` (measure) then `arrange` (place) — is
 * the real engine's shape too, and it is not optional: a parent cannot place a
 * child until it knows how big the child wants to be, and a child cannot know
 * how big it wants to be until it knows how much room the parent has. Every
 * layout engine ever written is a way of breaking that circle.
 */
export interface Size {
  width: number
  height: number
}

/** A resolved rectangle in terminal cells. */
export interface LayoutBox {
  x: number
  y: number
  width: number
  height: number
}

export interface MeasureConstraints {
  maxWidth: number
  maxHeight: number
}

/**
 * A structural layout node. `measure` marks a leaf (e.g. text) that reports its
 * own intrinsic size; otherwise `children` are laid out with flexbox rules.
 *
 * This is a *mirror* of the render tree, not the render tree itself. Keeping
 * them separate is what lets `tui-core` swap in a completely different engine
 * (yoga) without the painter knowing.
 */
export interface LayoutInput {
  id?: string
  style?: TuiStyle
  children?: LayoutInput[]
  measure?: (constraints: MeasureConstraints) => Size
}

export interface LayoutResult {
  input: LayoutInput
  box: LayoutBox
  children: LayoutResult[]
}

/** Border + padding, summed per axis: to the layout pass they are one thing. */
function extents(style: TuiStyle): { h: number; v: number } {
  const border = borderInsets(style)
  const pad = resolveInsets(style.padding)
  return {
    h: border.left + border.right + pad.left + pad.right,
    v: border.top + border.bottom + pad.top + pad.bottom,
  }
}

/** Intrinsic OUTER size of a node given the space available to it. */
function intrinsicSize(node: LayoutInput, avail: Size): Size {
  const style = node.style ?? EMPTY_STYLE
  const { h: hExtra, v: vExtra } = extents(style)

  let width = style.width
  let height = style.height

  // What the node's CONTENT gets: its own box minus its border and padding.
  const inner: Size = {
    width: (width ?? avail.width) - hExtra,
    height: (height ?? avail.height) - vExtra,
  }

  if (node.measure) {
    const measured = node.measure({ maxWidth: inner.width, maxHeight: inner.height })
    if (width === undefined) width = measured.width + hExtra
    if (height === undefined) height = measured.height + vExtra
  } else if (width === undefined || height === undefined) {
    const content = contentSize(node, inner)
    if (width === undefined) width = content.width + hExtra
    if (height === undefined) height = content.height + vExtra
  }

  return { width: Math.max(0, width ?? 0), height: Math.max(0, height ?? 0) }
}

/** Content size of a container from its children: main-axis sum, cross-axis max. */
function contentSize(node: LayoutInput, inner: Size): Size {
  const style = node.style ?? EMPTY_STYLE
  const horizontal = (style.flexDirection ?? "column") === "row"
  const gap = style.gap ?? 0
  const children = node.children ?? []

  let main = 0
  let cross = 0
  children.forEach((child, i) => {
    const size = intrinsicSize(child, inner)
    if (i > 0) main += gap
    main += horizontal ? size.width : size.height
    cross = Math.max(cross, horizontal ? size.height : size.width)
  })

  return horizontal ? { width: main, height: cross } : { width: cross, height: main }
}

/** Place a node and its subtree inside `box` (its final outer rectangle). */
function arrange(node: LayoutInput, box: LayoutBox): LayoutResult {
  const style = node.style ?? EMPTY_STYLE
  const children = node.children ?? []
  if (node.measure || children.length === 0) {
    return { input: node, box, children: [] }
  }

  const border = borderInsets(style)
  const pad = resolveInsets(style.padding)
  const inner: LayoutBox = {
    x: box.x + border.left + pad.left,
    y: box.y + border.top + pad.top,
    width: box.width - border.left - border.right - pad.left - pad.right,
    height: box.height - border.top - border.bottom - pad.top - pad.bottom,
  }

  const horizontal = (style.flexDirection ?? "column") === "row"
  const gap = style.gap ?? 0
  const mainSize = horizontal ? inner.width : inner.height
  const crossSize = horizontal ? inner.height : inner.width

  const sizes = children.map((c) =>
    intrinsicSize(c, { width: inner.width, height: inner.height }),
  )
  const mains = sizes.map((s) => (horizontal ? s.width : s.height))
  const grows = children.map((c) => c.style?.flexGrow ?? 0)

  // Distribute leftover main-axis space to flex-grow children. Integer cells
  // only: you cannot give a child 3.5 columns, so the rounding remainder is
  // handed to the last grower rather than silently lost.
  const totalGrow = grows.reduce((a, b) => a + b, 0)
  const totalGap = gap * Math.max(0, children.length - 1)
  const free = mainSize - (mains.reduce((a, b) => a + b, 0) + totalGap)
  if (totalGrow > 0 && free > 0) {
    const per = Math.floor(free / totalGrow)
    let remaining = free
    children.forEach((_, i) => {
      if (grows[i] > 0) {
        const add = per * grows[i]
        mains[i] += add
        remaining -= add
      }
    })
    for (let i = children.length - 1; i >= 0 && remaining > 0; i -= 1) {
      if (grows[i] > 0) {
        mains[i] += remaining
        remaining = 0
      }
    }
  }

  const align = style.alignItems ?? "stretch"
  const results: LayoutResult[] = []
  let cursor = horizontal ? inner.x : inner.y

  children.forEach((child, i) => {
    const childMain = mains[i]
    // NOTE, faithfully copied from the real engine: `stretch` overrides an
    // explicit cross-axis size. `yogaLayoutEngine` does not do this — its own
    // source calls itself "a stricter flexbox (it honors explicit cross-axis
    // sizes this engine stretches)". Two engines behind one seam, and they
    // disagree here on purpose; the scene below uses `alignItems: "start"`
    // where it wants its explicit width respected.
    let childCross = horizontal ? sizes[i].height : sizes[i].width
    if (align === "stretch") childCross = crossSize

    const childBox: LayoutBox = horizontal
      ? { x: cursor, y: inner.y, width: childMain, height: childCross }
      : { x: inner.x, y: cursor, width: childCross, height: childMain }

    results.push(arrange(child, childBox))
    cursor += childMain + gap
  })

  return { input: node, box, children: results }
}

/**
 * Lay out `root` inside a `container`. An absent width/height fills the
 * container (screen behavior); an explicit one shrinks to that size.
 */
function computeLayout(root: LayoutInput, container: Size): LayoutResult {
  const style = root.style ?? EMPTY_STYLE
  const intrinsic = intrinsicSize(root, container)
  const width = style.width === undefined ? container.width : intrinsic.width
  const height = style.height === undefined ? container.height : intrinsic.height
  return arrange(root, { x: 0, y: 0, width, height })
}

/**
 * The width of a string in CELLS. Here: one character, one cell.
 *
 * The real `stringCellWidth` is a Unicode grapheme-cluster walk that returns 0
 * for combining marks, 1 for normal glyphs and 2 for CJK/emoji, and the cell
 * buffer stores a wide glyph as a lead cell plus a zero-width continuation cell
 * so that "measurement and drawing never disagree — the invariant the POC
 * renderer violated". This file is ASCII + box-drawing only, so the naive
 * length is correct; the doc says what that assumption costs.
 */
function stringCellWidth(value: string): number {
  return [...value].length
}

function isTextLeaf(node: RenderNode): boolean {
  return node.text !== undefined && (node.children?.length ?? 0) === 0
}

/** Build the layout mirror of a render tree, measuring text leaves. */
function toLayoutInput(node: RenderNode): LayoutInput {
  if (isTextLeaf(node)) {
    const width = stringCellWidth(node.text ?? "")
    return { id: node.id, style: node.style, measure: () => ({ width, height: 1 }) }
  }
  return {
    id: node.id,
    style: node.style,
    children: (node.children ?? []).map(toLayoutInput),
  }
}

// ---------------------------------------------------------------------------
// 6. THE CELL BUFFER — the thing that is not a DOM
// ---------------------------------------------------------------------------

const BLANK = " "

/**
 * A framebuffer of terminal cells stored as a struct-of-arrays.
 *
 * Read the field list and notice what is absent: there are no nodes here. Once
 * paint has run, the tree is gone. A cell knows its glyph and its style id and
 * nothing about which `UINode` put it there — which is why the real buffer
 * carries a THIRD array, `ownerIds`, interning node ids so a mouse click at
 * (x, y) can be mapped back to a node. Hit-testing in a terminal is a reverse
 * lookup through the pixels, not a DOM walk.
 */
class CellBuffer {
  readonly graphemes: string[]
  readonly styleIds: Uint32Array

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const length = width * height
    this.graphemes = new Array<string>(length).fill(BLANK)
    this.styleIds = new Uint32Array(length)
  }

  index(x: number, y: number): number {
    return y * this.width + x
  }

  /**
   * Draw `text` starting at `(x, y)` and return the ending cursor column.
   * Writes are clipped to `clipRight` — clipping is per-cell and unconditional,
   * because there is nowhere for overflow to go.
   */
  writeText(
    x: number,
    y: number,
    value: string,
    styleId: number,
    clipRight: number = this.width,
  ): number {
    if (y < 0 || y >= this.height) return x
    const right = Math.min(this.width, clipRight)
    let cursor = x
    for (const grapheme of value) {
      if (cursor >= right) break
      if (cursor >= 0) {
        const i = this.index(cursor, y)
        this.graphemes[i] = grapheme
        this.styleIds[i] = styleId
      }
      cursor += 1
    }
    return cursor
  }
}

/** Render each buffer row to a plain string (one entry per row). */
function frameToLines(buffer: CellBuffer): string[] {
  const lines: string[] = []
  for (let y = 0; y < buffer.height; y += 1) {
    let line = ""
    const base = y * buffer.width
    for (let x = 0; x < buffer.width; x += 1) line += buffer.graphemes[base + x]
    lines.push(line)
  }
  return lines
}

// ---------------------------------------------------------------------------
// 7. PAINT — walk the tree and the layout together, writing cells
// ---------------------------------------------------------------------------

function intersect(a: LayoutBox, b: LayoutBox): LayoutBox {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

/**
 * Draw the four edges, then stamp the four corners over them.
 *
 * The corner-last ordering is not stylistic: the edge loops run the full span
 * including the ends, so `┌` would otherwise be a `─`. It is the sort of detail
 * that has no analogue in a renderer that emits markup, and every terminal UI
 * library has some version of it.
 */
function drawBorder(
  buffer: CellBuffer,
  box: LayoutBox,
  clip: LayoutBox,
  glyphs: BorderGlyphs,
  styleId: number,
): void {
  if (box.width < 1 || box.height < 1) return
  const left = box.x
  const right = box.x + box.width - 1
  const top = box.y
  const bottom = box.y + box.height - 1

  const put = (x: number, y: number, g: string): void => {
    if (x < clip.x || x >= clip.x + clip.width) return
    if (y < clip.y || y >= clip.y + clip.height) return
    buffer.writeText(x, y, g, styleId, x + 1)
  }

  for (let x = left; x <= right; x += 1) {
    put(x, top, glyphs.horizontal)
    put(x, bottom, glyphs.horizontal)
  }
  for (let y = top; y <= bottom; y += 1) {
    put(left, y, glyphs.vertical)
    put(right, y, glyphs.vertical)
  }
  put(left, top, glyphs.topLeft)
  put(right, top, glyphs.topRight)
  put(left, bottom, glyphs.bottomLeft)
  put(right, bottom, glyphs.bottomRight)
}

/**
 * Paint short text into a horizontal border edge (title on top, footer on
 * bottom). The write starts one cell after the left corner and is capped at the
 * right corner column, so a title can never eat a corner glyph and leave the
 * box looking broken.
 */
function drawEdgeText(
  buffer: CellBuffer,
  box: LayoutBox,
  clip: LayoutBox,
  edgeY: number,
  value: string,
  align: "left" | "center" | "right",
  styleId: number,
): void {
  if (!value || box.width < 3) return
  if (edgeY < clip.y || edgeY >= clip.y + clip.height) return
  const innerLeft = box.x + 1 // just after the left corner
  const innerRight = box.x + box.width - 1 // the right corner column
  const innerWidth = innerRight - innerLeft
  if (innerWidth <= 0) return
  const w = Math.min(stringCellWidth(value), innerWidth)
  let start = innerLeft
  if (align === "center") start = innerLeft + Math.max(0, Math.floor((innerWidth - w) / 2))
  else if (align === "right") start = innerRight - w
  buffer.writeText(start, edgeY, value, styleId, Math.min(innerRight, clip.x + clip.width))
}

function paintNode(
  node: RenderNode,
  layout: LayoutResult,
  buffer: CellBuffer,
  styles: StyleTable,
  clip: LayoutBox,
): void {
  const box = layout.box
  const boxClip = intersect(clip, box)
  // A node laid out entirely off-screen is not an error; it is just not drawn.
  if (boxClip.width <= 0 || boxClip.height <= 0) return

  const glyphs = borderGlyphs(node.style?.border)
  if (glyphs) {
    const borderStyleId = styles.intern(node.borderStyle ?? {})
    drawBorder(buffer, box, boxClip, glyphs, borderStyleId)
    if (node.title) {
      drawEdgeText(
        buffer,
        box,
        boxClip,
        box.y,
        node.title,
        node.titleAlign ?? "left",
        borderStyleId,
      )
    }
    if (node.footer) {
      drawEdgeText(
        buffer,
        box,
        boxClip,
        box.y + box.height - 1,
        node.footer,
        node.footerAlign ?? "left",
        borderStyleId,
      )
    }
  }

  if (isTextLeaf(node)) {
    if (box.y >= boxClip.y && box.y < boxClip.y + boxClip.height) {
      buffer.writeText(
        box.x,
        box.y,
        node.text ?? "",
        styles.intern(node.textStyle ?? {}),
        boxClip.x + boxClip.width,
      )
    }
    return
  }

  // Children paint after the parent and inside its clip: the deepest node wins
  // a contested cell, which is a terminal's entire answer to stacking order.
  const children = node.children ?? []
  children.forEach((child, i) => {
    const childLayout = layout.children[i]
    if (childLayout) paintNode(child, childLayout, buffer, styles, boxClip)
  })
}

interface RenderOutput {
  buffer: CellBuffer
  layout: LayoutResult
}

/** Full render pipeline: lay out `root` in `size`, then paint it into a buffer. */
function renderToBuffer(root: RenderNode, size: Size, styles: StyleTable): RenderOutput {
  const layout = computeLayout(toLayoutInput(root), size)
  const buffer = new CellBuffer(size.width, size.height)
  paintNode(root, layout, buffer, styles, {
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
  })
  return { buffer, layout }
}

// ---------------------------------------------------------------------------
// 8. DIFF — `Mutation`, one layer down
// ---------------------------------------------------------------------------

/** A contiguous run of changed columns `[start, end)` on row `y`. */
export interface CellRun {
  y: number
  start: number
  end: number
}

/** Two cells are visually equal when glyph AND style match. */
function cellsEqual(prev: CellBuffer, next: CellBuffer, i: number): boolean {
  return prev.graphemes[i] === next.graphemes[i] && prev.styleIds[i] === next.styleIds[i]
}

/**
 * Compute the changed cell RUNS between two frames.
 *
 * Runs, not cells, and the reason is the emit stage: moving the terminal cursor
 * costs an escape sequence of ~7 bytes, so eight changed cells in a row are
 * one cursor move plus eight glyphs, while eight scattered cells are eight
 * cursor moves. The diff's output shape is chosen by what the transport
 * charges for — exactly the reasoning behind batching mutations in step 05.
 *
 * A dimension change forces a full repaint: there is no meaningful
 * cell-to-cell correspondence between a 80x24 grid and a 100x30 one.
 */
function diffFrames(prev: CellBuffer, next: CellBuffer): CellRun[] {
  if (prev.width !== next.width || prev.height !== next.height) {
    return fullRepaintRuns(next)
  }

  const runs: CellRun[] = []
  const width = next.width

  for (let y = 0; y < next.height; y += 1) {
    const rowBase = y * width
    let x = 0
    while (x < width) {
      if (cellsEqual(prev, next, rowBase + x)) {
        x += 1
        continue
      }
      const start = x
      let end = x + 1
      while (end < width && !cellsEqual(prev, next, rowBase + end)) end += 1
      runs.push({ y, start, end })
      x = end
    }
  }

  return runs
}

function fullRepaintRuns(next: CellBuffer): CellRun[] {
  const runs: CellRun[] = []
  for (let y = 0; y < next.height; y += 1) runs.push({ y, start: 0, end: next.width })
  return runs
}

function uniqueRows(runs: readonly CellRun[]): number[] {
  const rows: number[] = []
  let last = -1
  for (const run of runs) {
    if (run.y !== last) {
      rows.push(run.y)
      last = run.y
    }
  }
  return rows
}

export interface FrameUpdate {
  revision: number
  dirtyRows: number[]
  changedRuns: CellRun[]
  fullRepaint: boolean
}

/**
 * Derive a `FrameUpdate` from a diff of `prev -> next`. With no previous frame
 * (or a size change) the result is a full repaint of every row — the first
 * frame is always the expensive one, and there is no way around that.
 */
function buildFrameUpdate(
  prev: CellBuffer | null,
  next: CellBuffer,
  revision: number,
): FrameUpdate {
  const dimensionsChanged =
    prev === null || prev.width !== next.width || prev.height !== next.height

  const runs = dimensionsChanged ? fullRepaintRuns(next) : diffFrames(prev, next)
  return {
    revision,
    dirtyRows: uniqueRows(runs),
    changedRuns: runs,
    fullRepaint: dimensionsChanged,
  }
}

// ---------------------------------------------------------------------------
// 9. EMIT — what a real surface would have written, measured but never written
// ---------------------------------------------------------------------------

/** Move the cursor to a 0-based cell using a 1-based CUP sequence. */
function cursorTo(x: number, y: number): string {
  return `\x1b[${y + 1};${x + 1}H`
}

/**
 * A full SGR sequence that resets then applies `style`. The leading `0` makes
 * each style self-contained, so switching styles never inherits attributes from
 * whatever was set before.
 */
function sgrFor(style: CellStyle): string {
  const params = ["0"]
  if (style.bold) params.push("1")
  if (style.dim) params.push("2")
  if (style.inverse) params.push("7")
  return `\x1b[${params.join(";")}m`
}

/**
 * Encode a frame update the way `AnsiCellSurface.present` does — one cursor
 * move per run, an SGR only when the style id actually changes, and no
 * screen clear anywhere. The result is RETURNED, not written: this step must
 * not touch the terminal it is running in.
 */
function encodePresent(
  frame: CellBuffer,
  update: FrameUpdate,
  styles: StyleTable,
): string {
  let out = ""
  let currentStyle = -1
  for (const run of update.changedRuns) {
    out += cursorTo(run.start, run.y)
    for (let x = run.start; x < run.end; x += 1) {
      const i = frame.index(x, run.y)
      const styleId = frame.styleIds[i]
      if (styleId !== currentStyle) {
        out += sgrFor(styles.get(styleId))
        currentStyle = styleId
      }
      out += frame.graphemes[i]
    }
  }
  // Leave the terminal in a known style after touching any cells.
  if (currentStyle > 0) out += "\x1b[0m"
  return out
}

// ---------------------------------------------------------------------------
// 10. The host: tree in, frame out
// ---------------------------------------------------------------------------

interface Frame {
  render: RenderNode
  layout: LayoutResult
  buffer: CellBuffer
  previous: CellBuffer | null
  update: FrameUpdate
  ansi: string
}

/**
 * The whole terminal host, minus everything that needs a terminal. Compare with
 * the real `TuiHost` + `TuiRenderer` pair: a `MutableTree` fed by mutation
 * batches, converted to a render tree, laid out, painted into a fresh buffer,
 * diffed against the last one, and presented to a `CellSurface`.
 *
 * Note `previous`: the host keeps exactly one frame of history. That single
 * field is the whole memory cost of frame diffing, and it is what turns "redraw
 * everything" into "emit 8% of a screen".
 */
class TuiHost {
  readonly tree = new MutableTree()
  readonly styles = new StyleTable()
  private previous: CellBuffer | null = null
  private revision = 0

  constructor(private readonly size: Size) {}

  applyBatch(mutations: Mutation[]): Frame {
    this.tree.applyBatch(mutations)
    return this.renderFrame()
  }

  private renderFrame(): Frame {
    const root = this.tree.getRoot()
    // An empty tree is a blank box, not a crash — the host outlives the plugin.
    const render: RenderNode = root ? uinodeToRenderNode(root) : { type: "box" }
    const { buffer, layout } = renderToBuffer(render, this.size, this.styles)
    this.revision += 1
    const update = buildFrameUpdate(this.previous, buffer, this.revision)
    const ansi = encodePresent(buffer, update, this.styles)
    const previous = this.previous
    this.previous = buffer
    return { render, layout, buffer, previous, update, ansi }
  }
}

// ---------------------------------------------------------------------------
// 11. The scene — a realistic tree from a plugin that knows nothing about this
// ---------------------------------------------------------------------------

const SCREEN: Size = { width: 52, height: 14 }
const PANEL_WIDTH = 46

/** One row of the list: a name that grows, and a right-aligned status. */
const hostRow = (key: string, name: string, status: string): UINode => ({
  id: `row-${key}`,
  type: "box",
  props: { flexDirection: "row" },
  children: [
    {
      id: `name-${key}`,
      type: "text",
      props: { flexGrow: 1 },
      children: [text(`name-${key}-t`, name)],
    },
    {
      id: `stat-${key}`,
      type: "text",
      props: { dim: true },
      children: [text(`stat-${key}-t`, status)],
    },
  ],
})

/**
 * `setProps` replaces ALL props, never a subset (step 02), so changing the
 * footer means resending the panel's whole prop bag. Hence a factory.
 */
const panelProps = (footer: string): Record<string, JSONValue> => ({
  border: "rounded",
  width: PANEL_WIDTH,
  padding: { left: 1, right: 1 },
  gap: 1,
  title: " uniview · one tree, many hosts ",
  titleAlign: "center",
  footer,
  footerAlign: "right",
})

const scene: UINode = {
  id: "screen",
  type: "box",
  // `alignItems: "start"` because this engine's `stretch` would override the
  // panel's explicit width. See the note in `arrange`.
  props: { padding: 1, gap: 1, alignItems: "start" },
  children: [
    {
      id: "panel",
      type: "box",
      props: panelProps(" frame 1 · 5 hosts "),
      children: [
        {
          id: "lede",
          type: "text",
          props: { bold: true },
          children: [text("lede-t", "the same UINode tree, in cells")],
        },
        {
          id: "rows",
          type: "box",
          props: {},
          children: [
            hostRow("svelte", "host-svelte", "ready"),
            hostRow("vue", "host-vue", "ready"),
            hostRow("react", "host-react", "ready"),
            hostRow("appkit", "UniviewAppKit", "ready"),
            hostRow("tui", "host-tui", "connecting"),
          ],
        },
      ],
    },
    {
      id: "caption",
      type: "text",
      props: { dim: true },
      children: [text("caption-t", "layout -> paint -> diff -> emit")],
    },
  ],
}

/**
 * Frame 2. A small change, of the shape a real plugin emits every keystroke:
 * one status text flips, one row appears, and the panel's footer counter
 * updates. Nothing here says "repaint" — the host has to work that out.
 */
const frame2Batch: Mutation[] = [
  { type: "setText", nodeId: "stat-tui-t", text: "ready" },
  {
    type: "appendChild",
    parentId: "rows",
    node: hostRow("harmony", "host-harmony", "queued"),
  },
  { type: "setProps", nodeId: "panel", props: panelProps(" frame 2 · 6 hosts ") },
]

// ---------------------------------------------------------------------------
// 12. Printing helpers
// ---------------------------------------------------------------------------

const GUTTER = "       " // 3 spaces + 2 digits + 1 space + 1 edge marker

/** Print a buffer as text art, with a column ruler and row numbers. */
function printFrame(buffer: CellBuffer): void {
  const tens = Array.from({ length: buffer.width }, (_, x) =>
    x % 10 === 0 ? String((x / 10) % 10) : " ",
  ).join("")
  const units = Array.from({ length: buffer.width }, (_, x) => String(x % 10)).join("")
  console.log(GUTTER + tens)
  console.log(GUTTER + units)
  frameToLines(buffer).forEach((line, y) => {
    console.log(`   ${String(y).padStart(2)} |${line}|`)
  })
}

/** Walk the render tree and the layout result together, printing rects. */
function printLayout(node: RenderNode, layout: LayoutResult, depth = 0): void {
  const box = layout.box
  const label = `${"  ".repeat(depth)}<${node.type ?? "box"}#${node.id ?? "-"}>`
  const rect =
    `x=${String(box.x).padStart(2)} y=${String(box.y).padStart(2)} ` +
    `w=${String(box.width).padStart(2)} h=${String(box.height).padStart(2)}`
  const content = node.text !== undefined ? `  ${JSON.stringify(node.text)}` : ""
  console.log(`  ${label.padEnd(26)} ${rect}${content}`)
  const children = node.children ?? []
  children.forEach((child, i) => {
    const childLayout = layout.children[i]
    if (childLayout) printLayout(child, childLayout, depth + 1)
  })
}

/** The glyphs a run covers, in one buffer. */
function sliceOf(buffer: CellBuffer, run: CellRun): string {
  let out = ""
  for (let x = run.start; x < run.end; x += 1) out += buffer.graphemes[buffer.index(x, run.y)]
  return out
}

const cellsIn = (runs: readonly CellRun[]): number =>
  runs.reduce((total, run) => total + (run.end - run.start), 0)

/** `y=NN x=AA..BB  N cell(s)` — the coordinates a surface would cursor to. */
function runLabel(run: CellRun): string {
  const width = run.end - run.start
  return (
    `y=${String(run.y).padStart(2)} ` +
    `x=${String(run.start).padStart(2)}..${String(run.end).padStart(2)}  ` +
    `${String(width).padStart(2)} cell${width === 1 ? " " : "s"}`
  )
}

// ---------------------------------------------------------------------------
// 13. Run it
// ---------------------------------------------------------------------------

const host = new TuiHost(SCREEN)

console.log("=== 1. The tree — the protocol, not a terminal in sight ===\n")
console.log(
  show(scene)
    .split("\n")
    .map((l) => "  " + l)
    .join("\n"),
)
console.log(
  "\n  Nothing above mentions a cell, a column, a glyph or an escape code. This\n" +
    "  is the same shape steps 08-10 handed to Svelte, Vue, React and AppKit.",
)

const frame1 = host.applyBatch([{ type: "setRoot", node: scene }])

console.log("\n=== 2. LAYOUT — every node gets a rectangle, measured in cells ===\n")
printLayout(frame1.render, frame1.layout)
console.log(
  "\n  Read the row rects: <name-*> is flexGrow:1, so it absorbs the leftover\n" +
    "  width and pushes <stat-*> to the right edge — that is the whole of\n" +
    '  "right-aligned" here. And <panel> is 46 wide but <lede> starts at x=3,\n' +
    "  because one cell of border plus one of padding is gone on each side.",
)

console.log("\n=== 3. PAINT — the cells, printed as the terminal would show them ===\n")
printFrame(frame1.buffer)
console.log(
  "\n  The border is characters: ╭ ─ ╮ │ ╰ ╯, drawn edge-first with the corners\n" +
    "  stamped over them. The title is not above the box, it is IN the top\n" +
    "  border row, overwriting part of the ─ run; the footer is in the bottom\n" +
    "  one. There is no CSS property that does this because there is no box —\n" +
    "  there are only cells, and some of them happen to look like a box.",
)

console.log("\n=== 4. The first frame is always a full repaint ===")
console.log(`  fullRepaint          : ${frame1.update.fullRepaint}  (no previous buffer)`)
console.log(
  `  runs / dirty rows    : ${frame1.update.changedRuns.length} / ${frame1.update.dirtyRows.length}`,
)
console.log(
  `  cells emitted        : ${cellsIn(frame1.update.changedRuns)} of ` +
    `${SCREEN.width * SCREEN.height}  (100%)`,
)
console.log(`  ANSI bytes           : ${bytes(frame1.ansi)}`)

// --- frame 2 ---------------------------------------------------------------

console.log("\n=== 5. A small change arrives ===")
for (const m of frame2Batch) {
  const summary =
    m.type === "setText"
      ? `${m.nodeId} -> ${JSON.stringify(m.text)}`
      : m.type === "appendChild"
        ? `${m.node.id} under ${m.parentId}`
        : m.type === "setProps"
          ? `${m.nodeId} (all props resent; footer changed)`
          : ""
  console.log(`  ${m.type.padEnd(12)} ${summary}`)
}

const frame2 = host.applyBatch(frame2Batch)

console.log(
  `\n  the in-place MutableTree placed it: parentId("row-harmony") = ` +
    `${JSON.stringify(host.tree.parentId("row-harmony"))}, ` +
    `getNode("stat-tui-t").text = ${JSON.stringify(host.tree.getNode("stat-tui-t")?.text)}`,
)

console.log("\n=== 6. Frame 2 ===\n")
printFrame(frame2.buffer)

console.log("\n=== 7. DIFF — the exact runs that changed ===\n")
const previous = frame2.previous as CellBuffer
for (const run of frame2.update.changedRuns) {
  const before = sliceOf(previous, run)
  const after = sliceOf(frame2.buffer, run)
  console.log(`  ${runLabel(run)}   ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
}

console.log(
  "\n  Most of those runs are not what the plugin said. The plugin changed one\n" +
    "  status, added one row and set one prop. The host DERIVED the rest: a\n" +
    "  sixth row makes the panel one cell taller, which moves the bottom border\n" +
    "  down a row, which moves the caption below it down a row. A mutation is a\n" +
    "  statement about the tree; a run is a statement about the screen, and the\n" +
    "  two do not correspond — which is exactly why the host diffs frames\n" +
    "  instead of trying to translate mutations into cursor moves.\n" +
    "\n" +
    "  Note also where the runs BREAK. Row 9 is six separate runs because a few\n" +
    "  cells in the middle happen to hold the same character before and after\n" +
    "  (the spaces between words). The diff is per cell and completely blind to\n" +
    "  meaning; it does not know a panel moved, only that 153 cells differ.",
)

// --- the ratio this whole step exists to print -----------------------------

const totalCells = SCREEN.width * SCREEN.height
const emitted = cellsIn(frame2.update.changedRuns)

/** What the SAME frame would have cost with no previous buffer to diff against. */
const fullRepaintBytes = (buffer: CellBuffer): number =>
  bytes(
    encodePresent(
      buffer,
      {
        revision: 0,
        dirtyRows: uniqueRows(fullRepaintRuns(buffer)),
        changedRuns: fullRepaintRuns(buffer),
        fullRepaint: true,
      },
      host.styles,
    ),
  )
const fullRepaintAnsi = fullRepaintBytes(frame2.buffer)

console.log("\n=== 8. Cells in the frame vs cells actually emitted ===")
console.log(`  frame                : ${SCREEN.width} x ${SCREEN.height} = ${totalCells} cells`)
console.log(
  `  changed runs         : ${frame2.update.changedRuns.length} runs on ` +
    `${frame2.update.dirtyRows.length} rows`,
)
console.log(
  `  cells emitted        : ${emitted}  ` +
    `(${((emitted / totalCells) * 100).toFixed(1)}% of the frame)`,
)
console.log(`  ANSI bytes, diffed   : ${bytes(frame2.ansi)}`)
console.log(`  ANSI bytes, full     : ${fullRepaintAnsi}`)
console.log(
  `  saving               : ${(100 - (bytes(frame2.ansi) / fullRepaintAnsi) * 100).toFixed(1)}% ` +
    "of the bytes a naive repaint would have written",
)
console.log(`  style ids interned   : ${host.styles.palette().length}  ` +
  `${JSON.stringify(host.styles.palette())}`)
console.log(
  "\n  21% is the EXPENSIVE case: inserting a row reflows everything below it,\n" +
    "  and a terminal has no scroll region trick available once a bordered panel\n" +
    "  is in the way. The common case is one keystroke changing one string.",
)

// --- frame 3: the case that actually happens on every keystroke ------------

const frame3 = host.applyBatch([{ type: "setText", nodeId: "stat-vue-t", text: "syncing" }])
const emitted3 = cellsIn(frame3.update.changedRuns)

console.log("\n=== 9. The common case: one setText ===")
for (const run of frame3.update.changedRuns) {
  console.log(
    `  ${runLabel(run)}   ${JSON.stringify(sliceOf(frame2.buffer, run))} -> ` +
      `${JSON.stringify(sliceOf(frame3.buffer, run))}`,
  )
}
console.log(
  `  cells emitted        : ${emitted3} of ${totalCells}  ` +
    `(${((emitted3 / totalCells) * 100).toFixed(1)}% of the frame)`,
)
console.log(
  `  ANSI bytes           : ${bytes(frame3.ansi)}  ` +
    `(the same frame as a full repaint: ${fullRepaintBytes(frame3.buffer)})`,
)
console.log(
  "  The host still laid out and painted all 728 cells — it has no idea which\n" +
    "  node changed, and does not want one. It found out afterwards, by looking.",
)

console.log(
  "\n  Scale that. At 60 frames per second on an 80x24 terminal, repainting\n" +
    "  everything is 1920 cells x 60 = 115,200 cell writes per second down a\n" +
    "  pty, and the user SEES it: a full repaint is a visible flash because the\n" +
    "  terminal composites mid-stream. The diff is not an optimization the way\n" +
    "  a cache is an optimization — it is the difference between a UI and a\n" +
    "  flickering one. This is step 05's lesson, one layer down: the RPC\n" +
    "  boundary sends mutations instead of trees for the same reason the\n" +
    "  terminal sends runs instead of screens.",
)

console.log(
  "\nStage C closes here. Five hosts — Svelte, Vue, React, AppKit, a character\n" +
    "grid — one `UINode` tree, six mutation kinds, and not one line of shared\n" +
    "rendering code between the first and the last. The terminal host is the\n" +
    "proof because it shares nothing with a browser: no elements, no layout\n" +
    "engine it did not write, no repaint it did not schedule. Stage D keeps this\n" +
    "host and moves the PLUGIN instead — to a Worker, then to another process.",
)
