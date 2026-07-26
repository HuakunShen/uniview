/**
 * Step 10 — A host in a language with no JavaScript runtime.
 *
 * Steps 08 and 09 wrote hosts in Svelte, Vue and React. Every one of them
 * received a `UINode` that was *already a JavaScript object*: the plugin ran in
 * a Worker in the same browser, `postMessage` structured-cloned the tree, and
 * the host read `node.props.disabled` off a live object graph. Nothing was ever
 * parsed, nothing was ever type-checked, and nothing could ever fail to decode.
 *
 * AppKit gets none of that. `packages/UniviewAppKit` is Swift. It receives
 * **bytes**. It has no `Object`, no `undefined`, no structural typing, no `any`,
 * and — this is the part that shapes the protocol — no way to be handed a
 * closure. `JSONDecoder` turns the bytes into `struct UINode` or it throws.
 *
 * That is why this step matters more than it looks. `CLAUDE.md`:
 *
 *   "The renderer is what gets reimplemented on every platform (macOS AppKit
 *    today; Windows and HarmonyOS next)."
 *   "`UniviewNativeCore` (shadow tree, mutations, the layout seam) is
 *    deliberately small enough to reimplement per platform in about a week."
 *
 * A week is only possible if the wire format decodes into plain structs with no
 * negotiation. Every decision step 01 made — string ids, JSON-only props,
 * handler *ids* instead of functions, text as an explicit `#text` node kind —
 * exists so that this decode is a hundred lines of `Codable` and not a runtime.
 *
 * ---------------------------------------------------------------------------
 * A NOTE ON WHAT THIS FILE IS, AND IS NOT
 * ---------------------------------------------------------------------------
 * There is no Swift toolchain on the machine this curriculum was written on
 * (`swift` and `swiftc` are both absent — see `learn/DECISIONS.md`). Nothing
 * below was compiled or run as Swift, and this file does not pretend otherwise.
 *
 * It is the same algorithms as `UniviewNativeCore`, transliterated into
 * TypeScript and written *without* the JS conveniences a statically typed host
 * does not have:
 *
 *   - no `any`, no duck typing: the decoder's input is `unknown` and every
 *     field is pulled through an explicit typed accessor, the way
 *     `KeyedDecodingContainer.decode(_:forKey:)` does;
 *   - `JSONValue` is a tagged union with payloads — Swift's `enum` with
 *     associated values — not `Record<string, unknown>`;
 *   - props are a `Map`, not an object literal, because `[String: JSONValue]`
 *     is a dictionary and has no prototype, no `__proto__` and no `.foo`;
 *   - optionals are `T | null` and must be unwrapped at every use, because
 *     Swift has `String?` and no `undefined`;
 *   - the shadow tree is mutated **in place** through a reference type, because
 *     `ShadowNode` is a `final class` — there is no structural sharing here,
 *     and section 8 explains why the native host does not want any.
 *
 * The real Swift is quoted in `docs/10-native-host.md`, with links.
 */

// ---------------------------------------------------------------------------
// 1. The wire — a string of bytes, and nothing else
// ---------------------------------------------------------------------------

/** UTF-8 length. What a socket actually carries. */
const bytes = (value: string): number => new TextEncoder().encode(value).length

/**
 * The first frame, exactly as it leaves `applyMutations(mutations)` and arrives
 * at the Swift side of the bridge. Read it as text: this is all the host gets.
 *
 * Everything a JS host takes for granted is missing here, and its absence is
 * the design:
 *
 *   "n1"                    ids are STRINGS. Not object references, not
 *                           WeakMap keys — a native host indexes by them.
 *   {"type":"#text",...}    text is a NODE with an id, not a bare string, so a
 *                           `setText` can address it. (Bare strings still
 *                           decode, for legacy trees — see section 4.)
 *   "_onClickHandlerId"     the click handler is the string "h_1". There is no
 *                           representation of a JS function in this document,
 *                           and no way to invent one on the other side.
 *   "_style":{...}          the Style IR: semantic tokens and numbers, never a
 *                           CSS string the host would have to parse.
 */
const FIRST_FRAME_JSON = `[
  {"type":"setRoot","node":{
    "id":"n1","type":"View","props":{"_style":{"gap":8,"flexDirection":"column"}},
    "children":[
      {"id":"n2t","type":"Text","props":{},"children":[
        {"id":"n2","type":"#text","props":{},"children":[],"text":"Clicked 0 times"}]},
      {"id":"n3","type":"Button","props":{"disabled":true,"_onClickHandlerId":"h_1"},
       "children":[{"id":"n4","type":"#text","props":{},"children":[],"text":"Click me"}]},
      {"id":"n5","type":"sparkline","props":{"values":[1,3,5]},"children":[]}
    ]}}
]`

// ---------------------------------------------------------------------------
// 2. `JSONValue` — a discriminated union becomes an enum with associated values
// ---------------------------------------------------------------------------

/**
 * Swift:
 *
 *   public enum JSONValue: Equatable, Sendable {
 *       case null
 *       case bool(Bool)
 *       case number(Double)
 *       case string(String)
 *       case array([JSONValue])
 *       case object([String: JSONValue])
 *   }
 *
 * The TS protocol writes this as `null | boolean | number | string | ...`,
 * which is free because a JS value already *is* one of those. Swift has to name
 * the cases, and that changes how props are read: there is no `props.disabled`,
 * only `props["disabled"]`, which is `JSONValue?`, which then has to be matched.
 *
 * The `Map` for `object` is deliberate: `[String: JSONValue]` is a dictionary.
 * It has no prototype and no `.length`, and `"__proto__"` is just a key.
 */
type JSONValue =
  | { kind: "null" }
  | { kind: "bool"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "array"; value: JSONValue[] }
  | { kind: "object"; value: Map<string, JSONValue> }

/**
 * Swift's convenience accessors, verbatim in spirit:
 *
 *   public var stringValue: String? {
 *       if case .string(let value) = self { return value }
 *       return nil
 *   }
 *
 * Note what these return. Not `string`, not `string | undefined` — an Optional
 * that the caller is *forced* to unwrap. `node.props["disabled"]?.boolValue ??
 * false` is the real line in `ButtonComponent`, and it has two `?`s in it for
 * two different reasons: the key may be absent, and the value may be the wrong
 * case. A JS host writes `props.disabled` and finds out neither.
 */
const stringValue = (v: JSONValue | undefined): string | null =>
  v !== undefined && v.kind === "string" ? v.value : null
const boolValue = (v: JSONValue | undefined): boolean | null =>
  v !== undefined && v.kind === "bool" ? v.value : null
const numberValue = (v: JSONValue | undefined): number | null =>
  v !== undefined && v.kind === "number" ? v.value : null
const objectValue = (v: JSONValue | undefined): Map<string, JSONValue> | null =>
  v !== undefined && v.kind === "object" ? v.value : null

/**
 * `JSONValue.preview` from `StyleIR.swift`, used in error messages. Swift
 * interpolates a `Double`, so an integral 8 prints as "8.0"; `toFixed(1)` keeps
 * the message faithful rather than JS-shaped.
 */
function preview(v: JSONValue): string {
  switch (v.kind) {
    case "null":
      return "null"
    case "bool":
      return `${v.value}`
    case "number":
      return Number.isInteger(v.value) ? v.value.toFixed(1) : `${v.value}`
    case "string":
      return `"${v.value}"`
    case "array":
      return "an array"
    case "object":
      return "an object"
  }
}

// ---------------------------------------------------------------------------
// 3. `DecodingError` — a decode that can fail, and says exactly where
// ---------------------------------------------------------------------------

/**
 * Swift's `DecodingError` carries three things: which of four cases failed, the
 * `codingPath` (the chain of keys walked so far), and a `debugDescription`.
 * That triple is the whole reason a native host is *safer* than a JS host here:
 * a malformed frame cannot enter the tree at all, and the report names the
 * field.
 *
 * The JS hosts have an equivalent — the protocol's Zod schemas — but it is
 * optional and off: "Off by default: validation walks the whole payload and is
 * not free" (`packages/host-sdk/src/validate.ts`). A Swift host has no such
 * switch. There is no untyped path into `ShadowTree`.
 */
type DecodingErrorKind = "typeMismatch" | "keyNotFound" | "dataCorrupted"

class DecodingError extends Error {
  constructor(
    readonly kind: DecodingErrorKind,
    readonly codingPath: readonly string[],
    readonly debugDescription: string,
  ) {
    super(debugDescription)
    this.name = "DecodingError"
  }

  /** Swift's own description is longer, but carries exactly these three parts. */
  describe(): string {
    const path = this.codingPath.length > 0 ? this.codingPath.join(".") : "(root)"
    return `DecodingError.${this.kind} at ${path}: ${this.debugDescription}`
  }
}

/** How Swift's JSONDecoder names what it actually found. */
function foundTypeName(raw: unknown): string {
  if (raw === null) return "null"
  if (Array.isArray(raw)) return "an array"
  switch (typeof raw) {
    case "boolean":
      return "a boolean"
    case "number":
      return "a number"
    case "string":
      return "a string"
    case "object":
      return "a dictionary"
    default:
      return "an unsupported value"
  }
}

/**
 * `KeyedDecodingContainer`, in miniature. Everything the decoder reads goes
 * through this: there is no path from `unknown` into a typed field that does
 * not pass a check and record a coding path.
 */
class KeyedContainer {
  private constructor(
    private readonly fields: Map<string, unknown>,
    readonly codingPath: readonly string[],
  ) {}

  /** `try decoder.container(keyedBy: CodingKeys.self)` */
  static of(raw: unknown, codingPath: readonly string[]): KeyedContainer {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new DecodingError(
        "typeMismatch",
        codingPath,
        `Expected to decode Dictionary<String, Any> but found ${foundTypeName(raw)} instead.`,
      )
    }
    return new KeyedContainer(
      new Map(Object.entries(raw as Record<string, unknown>)),
      codingPath,
    )
  }

  private pathTo(key: string): string[] {
    return [...this.codingPath, key]
  }

  /** `try container.decode(String.self, forKey:)` — absent key is an error. */
  decodeString(key: string): string {
    if (!this.fields.has(key)) {
      throw new DecodingError(
        "keyNotFound",
        this.pathTo(key),
        `No value associated with key "${key}".`,
      )
    }
    return this.expectString(key, this.fields.get(key))
  }

  /** `try container.decodeIfPresent(String.self, forKey:)` — absent is `nil`. */
  decodeStringIfPresent(key: string): string | null {
    const raw = this.fields.get(key)
    if (raw === undefined || raw === null) return null
    return this.expectString(key, raw)
  }

  /** `try container.decodeIfPresent([String: JSONValue].self, forKey:)` */
  decodeJSONObjectIfPresent(key: string): Map<string, JSONValue> | null {
    const raw = this.fields.get(key)
    if (raw === undefined || raw === null) return null
    if (typeof raw !== "object" || Array.isArray(raw)) {
      throw new DecodingError(
        "typeMismatch",
        this.pathTo(key),
        `Expected to decode Dictionary<String, JSONValue> but found ${foundTypeName(raw)} instead.`,
      )
    }
    const out = new Map<string, JSONValue>()
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out.set(k, decodeJSONValue(v, [...this.pathTo(key), k]))
    }
    return out
  }

  decodeArrayIfPresent(key: string): unknown[] | null {
    const raw = this.fields.get(key)
    if (raw === undefined || raw === null) return null
    if (!Array.isArray(raw)) {
      throw new DecodingError(
        "typeMismatch",
        this.pathTo(key),
        `Expected to decode Array<Any> but found ${foundTypeName(raw)} instead.`,
      )
    }
    return raw
  }

  /** The raw value for a key, for a nested `decode(UINode.self, forKey:)`. */
  requireValue(key: string): unknown {
    if (!this.fields.has(key)) {
      throw new DecodingError(
        "keyNotFound",
        this.pathTo(key),
        `No value associated with key "${key}".`,
      )
    }
    return this.fields.get(key)
  }

  valueIfPresent(key: string): unknown {
    return this.fields.get(key)
  }

  /** Where the decoder is standing — used to build a child's coding path. */
  private expectString(key: string, raw: unknown): string {
    if (typeof raw !== "string") {
      throw new DecodingError(
        "typeMismatch",
        this.pathTo(key),
        `Expected to decode String but found ${foundTypeName(raw)} instead.`,
      )
    }
    return raw
  }
}

/**
 * `JSONValue.init(from:)`, including its ordering comment:
 *
 *   "Bool must be attempted before Double: JSONDecoder keeps them distinct
 *    (a JSON number never decodes as Bool and vice versa)."
 */
function decodeJSONValue(raw: unknown, codingPath: readonly string[]): JSONValue {
  if (raw === null) return { kind: "null" }
  if (typeof raw === "boolean") return { kind: "bool", value: raw }
  if (typeof raw === "number") return { kind: "number", value: raw }
  if (typeof raw === "string") return { kind: "string", value: raw }
  if (Array.isArray(raw)) {
    return {
      kind: "array",
      value: raw.map((item, i) => decodeJSONValue(item, [...codingPath, `[${i}]`])),
    }
  }
  if (typeof raw === "object") {
    const out = new Map<string, JSONValue>()
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out.set(k, decodeJSONValue(v, [...codingPath, k]))
    }
    return { kind: "object", value: out }
  }
  // Unreachable from `JSON.parse` output, exactly as it is unreachable from
  // `JSONDecoder` — which is the point. A function prop never gets this far:
  // `JSON.stringify` drops it before it is ever bytes. Section 7 shows that.
  throw new DecodingError("dataCorrupted", codingPath, "Unsupported JSON value")
}

// ---------------------------------------------------------------------------
// 4. The decoded model — what a statically typed host actually holds
// ---------------------------------------------------------------------------

const TEXT_NODE_TYPE = "#text"

/**
 * `UniviewNativeCore.UINode`. Compare it with the TS protocol's:
 *
 *   TS      children: (UINode | string)[]      text?: string
 *   Swift   children: [UINode]                 text: String?
 *
 * Two real differences, both forced by the type system:
 *
 *   1. The union is gone. Swift's decoder normalizes a bare-string child into a
 *      `#text` node *at decode time* ("bare-string children (legacy) are
 *      normalized into `#text` nodes on decode"), so the rest of the host —
 *      mounter, layout, components — never sees the legacy shape at all. The
 *      web hosts carry that union all the way down to the render function.
 *   2. `text?: string` becomes `String?`. `undefined` does not exist; the field
 *      is `nil` and every read is an unwrap.
 */
interface UINode {
  id: string
  type: string
  props: Map<string, JSONValue>
  children: UINode[]
  text: string | null
}

/** `UINode.text(_:id:)` — note the default empty id, which matters below. */
function textNode(content: string, id = ""): UINode {
  return {
    id,
    type: TEXT_NODE_TYPE,
    props: new Map(),
    children: [],
    text: content,
  }
}

/**
 * `UINode.init(from:)`. The `ChildEntry` dance is the interesting bit: Swift
 * cannot say "a child is a node or a string" in the stored property, so it
 * decodes into a private throwaway enum and flattens immediately.
 *
 * A normalized legacy string gets `id: ""`. That is not a bug the host can fix
 * — a bare string never had an id — but it means no `setText` can ever address
 * it. One more reason the protocol made text an explicit node kind.
 */
function decodeUINode(raw: unknown, codingPath: readonly string[]): UINode {
  const container = KeyedContainer.of(raw, codingPath)
  const id = container.decodeString("id")
  const type = container.decodeString("type")
  const props = container.decodeJSONObjectIfPresent("props") ?? new Map<string, JSONValue>()
  const text = container.decodeStringIfPresent("text")
  const rawChildren = container.decodeArrayIfPresent("children") ?? []

  const children = rawChildren.map((child, i) => {
    const childPath = [...codingPath, `children[${i}]`]
    // `if let string = try? container.decode(String.self)` — string first.
    if (typeof child === "string") return textNode(child)
    return decodeUINode(child, childPath)
  })

  return { id, type, props, children, text }
}

/**
 * `Mutation` as an enum with associated values. The TS version is a union of
 * six interfaces sharing a `type` discriminant, which the compiler narrows for
 * free at zero runtime cost — and which therefore does *nothing* to a value
 * that came off a socket. Swift's version is a real enum, so it has to be
 * *decoded* into, and the decoder has a `default:` branch that throws.
 *
 * That `default:` is the difference between the two worlds in one line: the set
 * of mutation kinds is CLOSED and a seventh is rejected at the door. Contrast
 * `node.type`, which stays a bare `string` and is deliberately OPEN — an
 * unrecognised node type is not a decode error, it is the registry's fallback
 * (section 6). Same document, two opposite policies, both on purpose.
 */
type Mutation =
  | { case: "appendChild"; parentId: string; node: UINode }
  | { case: "insertBefore"; parentId: string; node: UINode; beforeId: string }
  | { case: "removeChild"; parentId: string; nodeId: string }
  | { case: "setText"; nodeId: string; text: string }
  | { case: "setProps"; nodeId: string; props: Map<string, JSONValue> }
  | { case: "setRoot"; node: UINode | null }

function decodeMutation(raw: unknown, codingPath: readonly string[]): Mutation {
  const container = KeyedContainer.of(raw, codingPath)
  const type = container.decodeString("type")
  switch (type) {
    case "appendChild":
      return {
        case: "appendChild",
        parentId: container.decodeString("parentId"),
        node: decodeUINode(container.requireValue("node"), [...codingPath, "node"]),
      }
    case "insertBefore":
      return {
        case: "insertBefore",
        parentId: container.decodeString("parentId"),
        node: decodeUINode(container.requireValue("node"), [...codingPath, "node"]),
        beforeId: container.decodeString("beforeId"),
      }
    case "removeChild":
      return {
        case: "removeChild",
        parentId: container.decodeString("parentId"),
        nodeId: container.decodeString("nodeId"),
      }
    case "setText":
      return {
        case: "setText",
        nodeId: container.decodeString("nodeId"),
        text: container.decodeString("text"),
      }
    case "setProps":
      return {
        case: "setProps",
        nodeId: container.decodeString("nodeId"),
        props: container.decodeJSONObjectIfPresent("props") ?? new Map<string, JSONValue>(),
      }
    case "setRoot": {
      // `decodeIfPresent` — an absent or null node means "render nothing".
      const node = container.valueIfPresent("node")
      return {
        case: "setRoot",
        node:
          node === undefined || node === null
            ? null
            : decodeUINode(node, [...codingPath, "node"]),
      }
    }
    default:
      // Verbatim from `Mutation.swift`:
      //   throw DecodingError.dataCorruptedError(
      //       forKey: .type, in: container,
      //       debugDescription: "Unknown mutation type: \(type)")
      throw new DecodingError(
        "dataCorrupted",
        [...codingPath, "type"],
        `Unknown mutation type: ${type}`,
      )
  }
}

function decodeMutations(text: string, label: string): Mutation[] {
  const raw: unknown = JSON.parse(text)
  if (!Array.isArray(raw)) {
    throw new DecodingError(
      "typeMismatch",
      [label],
      `Expected to decode Array<Mutation> but found ${foundTypeName(raw)} instead.`,
    )
  }
  return raw.map((m, i) => decodeMutation(m, [`${label}[${i}]`]))
}

/**
 * `CommitBatch` — "A revisioned batch of mutations (Fabric-style). `revision`
 * is a monotonic counter minted by the emitter; hosts apply batches in order
 * and may treat a re-delivered revision as an idempotent no-op or drift
 * signal."
 *
 * Where the number comes from matters and is easy to get wrong: nothing in the
 * TypeScript half of Uniview mints one. `PluginToHostAPI.applyMutations` takes
 * `mutations` and nothing else. The counter is stamped on the *host* side, in
 * `PluginConnection.emit`. Section 8 says what that does and does not protect.
 */
interface CommitBatch {
  revision: number
  mutations: Mutation[]
}

// ---------------------------------------------------------------------------
// 5. The Style IR — a prop whose type does not match is NOT a decode error
// ---------------------------------------------------------------------------

/**
 * `props` is `[String: JSONValue]`, so `{"disabled": "yes"}` decodes perfectly
 * happily: `"yes"` is a valid `JSONValue`. The mismatch surfaces one layer
 * later, when a component asks for a `Bool` and the Optional comes back `nil`.
 *
 * For the Style IR — the one prop with a real schema — the host does better
 * than that, and `StyleIR.decoding` explains why in full:
 *
 *   "Decode the Style IR **field by field**, so a single bad or unknown field
 *    costs only itself instead of the whole style. All-or-nothing decoding is
 *    the wrong trade here: the tree is a wire format shared with plugins that
 *    version independently of the host."
 *
 * So: strict at the frame level (a malformed mutation is rejected outright),
 * lenient-but-loud at the style level (a bad field is dropped and reported).
 * Those are two different answers to "what do I do with input I don't like",
 * and the native host needs both.
 */
interface StyleIR {
  flexDirection: string | null
  gap: number | null
  width: number | null
  height: number | null
  color: string | null
  backgroundColor: string | null
  fontSize: number | null
}

const emptyStyle = (): StyleIR => ({
  flexDirection: null,
  gap: null,
  width: null,
  height: null,
  color: null,
  backgroundColor: null,
  fontSize: null,
})

/** `StyleDecodeIssue.Reason`, and `description` word for word. */
type StyleDecodeIssue =
  | { field: string; reason: "unknownField" }
  | { field: string; reason: "invalidValue"; detail: string }

function describeIssue(issue: StyleDecodeIssue): string {
  return issue.reason === "unknownField"
    ? `style: unknown field '${issue.field}' — ignored`
    : `style: field '${issue.field}' has an unusable value — ignored (${issue.detail})`
}

/** `StyleIssueReporter = (String, StyleDecodeIssue) -> Void` */
type StyleIssueReporter = (nodeId: string, issue: StyleDecodeIssue) => void

/**
 * A subset of the real 50-field `Field` enum. What is faithful is the
 * *mechanism*: a key not in the enum is an `unknownField` issue, a key with the
 * wrong shape is an `invalidValue` issue carrying `preview`, an explicit null
 * is "unset", and everything else in the object still lands.
 */
function decodeStyleIR(value: JSONValue): { style: StyleIR; issues: StyleDecodeIssue[] } {
  const style = emptyStyle()
  if (value.kind !== "object") {
    return {
      style,
      issues: [
        {
          field: "style",
          reason: "invalidValue",
          detail: `expected an object, got ${preview(value)}`,
        },
      ],
    }
  }

  const issues: StyleDecodeIssue[] = []
  const stringFields = new Set(["flexDirection", "color", "backgroundColor"])
  const numberFields = new Set(["gap", "width", "height", "fontSize"])

  for (const name of [...value.value.keys()].sort()) {
    const raw = value.value.get(name)
    if (raw === undefined) continue
    // "An explicit null is 'unset' — exactly as if the key were absent."
    if (raw.kind === "null") continue

    if (stringFields.has(name)) {
      const decoded = stringValue(raw)
      if (decoded === null) {
        issues.push({ field: name, reason: "invalidValue", detail: `got ${preview(raw)}` })
        continue
      }
      if (name === "flexDirection") style.flexDirection = decoded
      else if (name === "color") style.color = decoded
      else style.backgroundColor = decoded
      continue
    }

    if (numberFields.has(name)) {
      const decoded = numberValue(raw)
      if (decoded === null) {
        issues.push({ field: name, reason: "invalidValue", detail: `got ${preview(raw)}` })
        continue
      }
      if (name === "gap") style.gap = decoded
      else if (name === "width") style.width = decoded
      else if (name === "height") style.height = decoded
      else style.fontSize = decoded
      continue
    }

    issues.push({ field: name, reason: "unknownField" })
  }

  return { style, issues }
}

// ---------------------------------------------------------------------------
// 6. `ShadowNode` / `ShadowTree` — the revisioned, in-place applier
// ---------------------------------------------------------------------------

/**
 * `ShadowNode` is a `final class` in Swift: a reference type, mutated in place,
 * holding a weak `parent` and stable `id`s. That is the deliberate opposite of
 * step 02's `MutableTree`, which clones the whole path to the root on every
 * mutation so a Svelte/React host can diff by reference equality.
 *
 * The native host has no such consumer. It reconciles `NSView`s against the
 * shadow tree *by id* ("keyed by node id ... reuses existing views (updating
 * them in place)"), so a fresh root object would buy nothing and cost an
 * allocation per mutation. Section 8 prints the identity check.
 */
class ShadowNode {
  props: Map<string, JSONValue>
  style: StyleIR
  text: string | null
  parent: ShadowNode | null = null
  children: ShadowNode[]

  constructor(
    readonly id: string,
    public type: string,
    props: Map<string, JSONValue>,
    style: StyleIR,
    text: string | null,
    children: ShadowNode[],
  ) {
    this.props = props
    this.style = style
    this.text = text
    this.children = children
    for (const child of children) child.parent = this
  }

  /** `ShadowNode.from(_:reportingTo:)` — decodes the Style IR on the way in. */
  static from(node: UINode, reporter: StyleIssueReporter | null): ShadowNode {
    return new ShadowNode(
      node.id,
      node.type,
      node.props,
      ShadowNode.resolveStyle(node.props, node.id, reporter),
      node.text,
      node.children.map((child) => ShadowNode.from(child, reporter)),
    )
  }

  /**
   * "`_style` is the Style IR a plugin's renderer resolved from its Tailwind
   *  classes and style object; `style` is raw IR, for trees authored natively."
   */
  static resolveStyle(
    props: Map<string, JSONValue>,
    nodeId: string,
    reporter: StyleIssueReporter | null,
  ): StyleIR {
    const raw = props.get("_style") ?? props.get("style")
    if (raw === undefined) return emptyStyle()
    const { style, issues } = decodeStyleIR(raw)
    if (reporter !== null) for (const issue of issues) reporter(nodeId, issue)
    return style
  }

  get isTextNode(): boolean {
    return this.type === TEXT_NODE_TYPE
  }

  /** `handlerId(for:)` — the protocol convention `onClick` -> `_onClickHandlerId`. */
  handlerId(event: string): string | null {
    return stringValue(this.props.get(`_${event}HandlerId`))
  }

  /** `renderedText` — this node's own text, or its descendants' concatenated. */
  get renderedText(): string {
    if (this.isTextNode) return this.text ?? ""
    if (this.type === "br") return "\n"
    return this.children.map((c) => c.renderedText).join("")
  }

  appendChild(child: ShadowNode): void {
    child.parent = this
    this.children.push(child)
  }

  /** "appends if the anchor is absent (matches the host's insertBefore fallback)" */
  insertChild(child: ShadowNode, beforeId: string): void {
    child.parent = this
    const index = this.children.findIndex((c) => c.id === beforeId)
    if (index >= 0) this.children.splice(index, 0, child)
    else this.children.push(child)
  }

  detachFromParent(): void {
    const parent = this.parent
    if (parent === null) return
    parent.children = parent.children.filter((c) => c !== this)
    this.parent = null
  }
}

/**
 * `ShadowTree`, including the one thing no JS host in this repository has:
 *
 *   /// Apply a commit batch in revision order. A batch whose revision is not
 *   /// newer than the last applied is ignored (idempotent replay / drift
 *   /// guard); returns whether it was applied.
 *   @discardableResult
 *   public func apply(_ batch: CommitBatch) -> Bool {
 *       if batch.revision <= revision { return false }
 *       ...
 *   }
 *
 * Four characters of comparison, and they are the most interesting divergence
 * in this step. Section 8 is about why the native host has it and the web hosts
 * do not.
 */
class ShadowTree {
  root: ShadowNode | null = null
  /** "The last applied commit revision; `-1` before the first commit." */
  revision = -1
  onStyleIssue: StyleIssueReporter | null = null

  private index = new Map<string, ShadowNode>()

  node(id: string): ShadowNode | null {
    return this.index.get(id) ?? null
  }

  /** The guard. Returns whether the batch was applied. */
  apply(batch: CommitBatch): boolean {
    if (batch.revision <= this.revision) return false
    for (const mutation of batch.mutations) this.applyMutation(mutation)
    this.revision = batch.revision
    return true
  }

  /** "Public for host-side replay and testing." */
  applyMutation(mutation: Mutation): void {
    switch (mutation.case) {
      case "setRoot":
        this.setRoot(mutation.node)
        break

      case "setProps": {
        const node = this.index.get(mutation.nodeId)
        if (node === undefined) return
        node.props = mutation.props
        node.style = ShadowNode.resolveStyle(
          mutation.props,
          mutation.nodeId,
          this.onStyleIssue,
        )
        break
      }

      case "setText": {
        const node = this.index.get(mutation.nodeId)
        if (node === undefined) return
        node.text = mutation.text
        break
      }

      case "appendChild": {
        const parent = this.index.get(mutation.parentId)
        if (parent === undefined) return
        this.detachIfPresent(mutation.node.id) // MOVE-safe: never duplicate an id
        const child = ShadowNode.from(mutation.node, this.onStyleIssue)
        parent.appendChild(child)
        this.indexSubtree(child)
        break
      }

      case "insertBefore": {
        const parent = this.index.get(mutation.parentId)
        if (parent === undefined) return
        this.detachIfPresent(mutation.node.id)
        const child = ShadowNode.from(mutation.node, this.onStyleIssue)
        parent.insertChild(child, mutation.beforeId)
        this.indexSubtree(child)
        break
      }

      case "removeChild": {
        // Note: `case .removeChild(_, let nodeId)` — the native applier ignores
        // `parentId` entirely and works off the index, where the JS
        // `MutableTree` resolves the parent first. Same outcome, one fewer way
        // to be wrong.
        const target = this.index.get(mutation.nodeId)
        if (target === undefined) return
        target.detachFromParent()
        this.unindexSubtree(target)
        break
      }
    }
  }

  private setRoot(node: UINode | null): void {
    this.index.clear()
    if (node === null) {
      this.root = null
      return
    }
    const newRoot = ShadowNode.from(node, this.onStyleIssue)
    this.root = newRoot
    this.indexSubtree(newRoot)
  }

  private detachIfPresent(id: string): void {
    const existing = this.index.get(id)
    if (existing === undefined) return
    existing.detachFromParent()
    this.unindexSubtree(existing)
  }

  private indexSubtree(node: ShadowNode): void {
    this.index.set(node.id, node)
    for (const child of node.children) this.indexSubtree(child)
  }

  private unindexSubtree(node: ShadowNode): void {
    this.index.delete(node.id)
    for (const child of node.children) this.unindexSubtree(child)
  }
}

/**
 * Step 02's `NaiveTree`, ported to the shadow tree. It has step 02's original
 * BUG 1 — `appendChild` pushes without detaching first — and one new one: no
 * revision, so every batch it is handed is applied.
 *
 * Both bugs are invisible until a batch arrives twice, which on a native host
 * is not a hypothetical: reconnects, `syncTree()` recovery, and an
 * at-least-once transport all do it.
 */
class NaiveShadowTree {
  root: ShadowNode | null = null
  private index = new Map<string, ShadowNode>()

  node(id: string): ShadowNode | null {
    return this.index.get(id) ?? null
  }

  /** No revision parameter at all — the naive signature. */
  apply(batch: CommitBatch): boolean {
    for (const mutation of batch.mutations) this.applyMutation(mutation)
    return true
  }

  private applyMutation(mutation: Mutation): void {
    switch (mutation.case) {
      case "setRoot": {
        this.index.clear()
        this.root = mutation.node === null ? null : ShadowNode.from(mutation.node, null)
        if (this.root !== null) this.indexSubtree(this.root)
        break
      }
      case "setText": {
        const node = this.index.get(mutation.nodeId)
        if (node !== undefined) node.text = mutation.text
        break
      }
      case "setProps": {
        const node = this.index.get(mutation.nodeId)
        if (node !== undefined) node.props = mutation.props
        break
      }
      case "appendChild": {
        const parent = this.index.get(mutation.parentId)
        if (parent === undefined) break
        // BUG 1 (step 02's): no detachIfPresent — a replayed append duplicates.
        const child = ShadowNode.from(mutation.node, null)
        parent.appendChild(child)
        this.indexSubtree(child)
        break
      }
      case "insertBefore": {
        const parent = this.index.get(mutation.parentId)
        if (parent === undefined) break
        const child = ShadowNode.from(mutation.node, null)
        parent.insertChild(child, mutation.beforeId)
        this.indexSubtree(child)
        break
      }
      case "removeChild": {
        const target = this.index.get(mutation.nodeId)
        if (target === undefined) break
        target.detachFromParent()
        this.index.delete(mutation.nodeId)
        break
      }
    }
  }

  private indexSubtree(node: ShadowNode): void {
    this.index.set(node.id, node)
    for (const child of node.children) this.indexSubtree(child)
  }
}

// ---------------------------------------------------------------------------
// 7. `ComponentRegistry` — the fallback is a constructor parameter
// ---------------------------------------------------------------------------

/** `HandlerExecutor = @MainActor (String, [JSONValue]) -> Void` */
type HandlerExecutor = (handlerId: string, args: JSONValue[]) => void

/** `MountContext` — injected so components stay transport- and bridge-agnostic. */
interface MountContext {
  executeHandler: HandlerExecutor
}

/**
 * The real `Component` protocol has seven members (`makeView`, `update`,
 * `intrinsicSize`, `viewKind`, `contentView`, `didApplyLayout`,
 * `mountsChildren`) and produces an `NSView`. This one produces lines of text,
 * which is the only part a machine without AppKit can run.
 */
interface Component {
  mountsChildren: boolean
  render(node: ShadowNode, context: MountContext): string[]
}

/**
 * `UnknownComponent`, verbatim in behaviour:
 *
 *   public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
 *       guard let label = view as? NSTextField else { return }
 *       label.stringValue = "Unknown: \(node.type)"
 *       label.textColor = .systemRed
 *   }
 *
 * Visible, red, and never dropped.
 */
const UnknownComponent: Component = {
  mountsChildren: false,
  render: (node) => [`Unknown: ${node.type}    <- NSTextField, .systemRed`],
}

/**
 * The Swift registry, and the difference step 07 flagged:
 *
 *   TS      get(type: string): T | undefined          // every host writes a
 *                                                     // fallback branch
 *   Swift   public init(fallback: Component = UnknownComponent())
 *           public func component(for type: String) -> Component
 *
 * `component(for:)` is non-optional. There is no branch to forget, because the
 * type system will not let the host receive "nothing" in the first place. A
 * host that wants a different placeholder passes one in; a host that wants no
 * placeholder cannot express that.
 */
class ComponentRegistry {
  private components = new Map<string, Component>()

  constructor(private readonly fallback: Component = UnknownComponent) {}

  register(types: string[], component: Component): void {
    for (const type of types) this.components.set(type, component)
  }

  /**
   * "The component for a type, or the fallback (visible placeholder) when
   *  unregistered — nodes are never silently dropped."
   */
  component(forType: string): Component {
    return this.components.get(forType) ?? this.fallback
  }

  isRegistered(type: string): boolean {
    return this.components.has(type)
  }

  /** `ComponentRegistry.standard()`, with the real type lists trimmed. */
  static standard(): ComponentRegistry {
    const registry = new ComponentRegistry()
    registry.register(["View", "div", "section", "main", "nav"], ViewComponent)
    registry.register(["Text", "p", "span", "label", "h1"], TextComponent)
    registry.register(["Button", "button"], ButtonComponent)
    return registry
  }

  /** Teaching-only: proves `component(for:)` handed back the fallback object. */
  fallbackComponent(): Component {
    return this.fallback
  }
}

const styleSummary = (style: StyleIR): string => {
  const parts: string[] = []
  if (style.flexDirection !== null) parts.push(`flexDirection=${style.flexDirection}`)
  if (style.gap !== null) parts.push(`gap=${style.gap}`)
  if (style.width !== null) parts.push(`width=${style.width}`)
  if (style.height !== null) parts.push(`height=${style.height}`)
  if (style.color !== null) parts.push(`color=${style.color}`)
  if (style.backgroundColor !== null) parts.push(`backgroundColor=${style.backgroundColor}`)
  if (style.fontSize !== null) parts.push(`fontSize=${style.fontSize}`)
  return parts.length > 0 ? ` {${parts.join(" ")}}` : ""
}

const ViewComponent: Component = {
  mountsChildren: true,
  render: (node) => [`[NSView #${node.id}]${styleSummary(node.style)}`],
}

const TextComponent: Component = {
  // "text-like leaves render their own content from props/text and return false"
  mountsChildren: false,
  render: (node) => [`[NSTextField #${node.id}] "${node.renderedText}"`],
}

const ButtonComponent: Component = {
  mountsChildren: false,
  render: (node) => {
    // The real line, both `?`s intact:
    //   button.isEnabled = !(node.props["disabled"]?.boolValue ?? false)
    const disabled = boolValue(node.props.get("disabled")) ?? false
    const title = stringValue(node.props.get("title")) ?? node.renderedText
    // `node.handlerId(for: "onClick")` — the event name as the plugin wrote it.
    const click = node.handlerId("onClick")
    return [
      `[NSButton #${node.id}] "${title}" enabled=${!disabled}` +
        (click !== null ? `  target->executeHandler("${click}")` : ""),
    ]
  },
}

/**
 * The mounter, reduced to its one teachable behaviour: walk the shadow tree,
 * ask the registry for a component per node, and stop descending where the
 * component says it renders its own content.
 */
function mount(
  node: ShadowNode,
  registry: ComponentRegistry,
  context: MountContext,
  depth = 0,
): string[] {
  const component = registry.component(node.type)
  const pad = "  ".repeat(depth)
  const lines = component.render(node, context).map((l) => pad + l)
  if (!component.mountsChildren) return lines
  // `for child in node.children where !child.isTextNode` — a #text node is
  // never a view of its own. Its content is read by whichever component owns
  // it, through `renderedText`.
  for (const child of node.children) {
    if (child.isTextNode) continue
    lines.push(...mount(child, registry, context, depth + 1))
  }
  return lines
}

// ---------------------------------------------------------------------------
// 8. Printing helpers
// ---------------------------------------------------------------------------

/** A one-line structural digest — what "the tree is unchanged" is checked against. */
function digest(node: ShadowNode | null): string {
  if (node === null) return "(no tree)"
  if (node.isTextNode) return `"${node.text ?? ""}"`
  const inner = node.children.map(digest).join(" ")
  return `${node.type}#${node.id}(${inner})`
}

const childIds = (node: ShadowNode | null): string =>
  node === null ? "(no tree)" : `[${node.children.map((c) => c.id).join(", ")}]`

function table(headers: [string, string, string], rows: [string, string, string][]): string {
  const all: [string, string, string][] = [headers, ...rows]
  const widths = [0, 1, 2].map((i) => Math.max(...all.map((r) => r[i].length)))
  const line = (r: [string, string, string], sep = " | "): string =>
    "  " + r.map((cell, i) => cell.padEnd(widths[i])).join(sep).trimEnd()
  const rule = "  " + widths.map((w) => "-".repeat(w)).join("-+-")
  return [line(headers), rule, ...rows.map((r) => line(r))].join("\n")
}

// ---------------------------------------------------------------------------
// 9. Run it
// ---------------------------------------------------------------------------

console.log("=== 1. What actually arrives: bytes ===")
console.log(`  ${bytes(FIRST_FRAME_JSON)} bytes of JSON, no JavaScript objects in sight.`)
console.log(
  "  A Swift host cannot be handed a tree. It is handed a document and must\n" +
    "  rebuild one — or refuse.",
)

// --- the valid decode ------------------------------------------------------

console.log("\n=== 2. Decoding it into a typed structure ===")
const firstFrame = decodeMutations(FIRST_FRAME_JSON, "mutations")
console.log(`  decoded ${firstFrame.length} mutation(s)`)
const rootMutation = firstFrame[0]
if (rootMutation.case !== "setRoot" || rootMutation.node === null) {
  throw new Error("expected the first frame to be a setRoot")
}
const decodedRoot = rootMutation.node
console.log(`  Mutation case          : .${rootMutation.case}`)
console.log(`  UINode.id / .type      : "${decodedRoot.id}" / "${decodedRoot.type}"`)
console.log(
  `  UINode.children        : [UINode] of ${decodedRoot.children.length} ` +
    `(no union with String — bare strings were normalized at decode)`,
)
console.log(
  `  UINode.text            : ${decodedRoot.text === null ? "nil" : `"${decodedRoot.text}"`}` +
    `  (String?, not string | undefined)`,
)
const buttonNode = decodedRoot.children[1]
console.log(
  `  props["disabled"]      : .bool(${boolValue(buttonNode.props.get("disabled"))})` +
    `   <- an enum case, matched, not a JS truthiness test`,
)
console.log(
  `  props["_onClickHandlerId"] : .string("${stringValue(buttonNode.props.get("_onClickHandlerId"))}")` +
    `   <- the click, as data`,
)

// Legacy bare-string children still decode, and the id they get is the finding.
const legacy = decodeUINode(
  JSON.parse(`{"id":"L","type":"p","children":["a bare string"]}`),
  ["legacy"],
)
console.log(
  `\n  legacy bare-string child normalized to: type="${legacy.children[0].type}" ` +
    `id="${legacy.children[0].id}" text="${legacy.children[0].text}"`,
)
console.log(
  "  The empty id is real and unfixable: a bare string never had one, so no\n" +
    "  setText can ever address that node. Hence #text as an explicit kind.",
)

// --- the rejections --------------------------------------------------------

console.log("\n=== 3. Input the decoder refuses, and what it says ===")

const rejections: [string, string][] = [
  [
    "an unknown mutation kind",
    `[{"type":"swapChildren","parentId":"n1","a":"n2","b":"n3"}]`,
  ],
  [
    "a field whose type does not match the schema",
    `[{"type":"setRoot","node":{"id":"n1","type":"View","children":[
       {"id":"n2","type":"#text","text":42}
     ]}}]`,
  ],
  ["a required key that is not there", `[{"type":"setText","text":"hello"}]`],
]

for (const [label, payload] of rejections) {
  console.log(`\n  ${label}:`)
  try {
    decodeMutations(payload, "mutations")
    console.log("    ...decoded?! (this line should be unreachable)")
  } catch (err) {
    if (err instanceof DecodingError) console.log(`    ${err.describe()}`)
    else throw err
  }
}

console.log(
  "\n  Note which of those is NOT in the list: an unknown node `type`. The set of\n" +
    "  MUTATION kinds is closed (a Swift enum, six cases, a throwing default) and\n" +
    "  the set of NODE types is open (a bare String). Section 5 is what happens to\n" +
    "  the open one.",
)

// --- props: strict frame, lenient style ------------------------------------

console.log("\n=== 4. A prop whose type does not match is a different problem ===")
const styleIssues: string[] = []
const tree = new ShadowTree()
tree.onStyleIssue = (nodeId, issue) =>
  styleIssues.push(`node ${nodeId}: ${describeIssue(issue)}`)

const badStyleFrame = decodeMutations(
  `[{"type":"setProps","nodeId":"n1","props":{"_style":{
      "gap":8, "width":"wide", "glow":3, "color":"accent", "height":null
    }}}]`,
  "mutations",
)

tree.apply({ revision: 0, mutations: firstFrame })
tree.apply({ revision: 1, mutations: badStyleFrame })

console.log(`  props sent : gap=8  width="wide"  glow=3  color="accent"  height=null`)
console.log(`  style kept : ${styleSummary(tree.node("n1")?.style ?? emptyStyle()).trim()}`)
console.log("  reported   :")
for (const issue of styleIssues) console.log(`    ${issue}`)
console.log(
  "  gap and color landed. `width` was the right name with the wrong shape,\n" +
    "  `glow` is a field this host has never heard of, `height: null` means\n" +
    '  "unset". None of them cost the node its other style — that is the whole\n' +
    "  point of decoding the IR field by field rather than all-or-nothing.",
)
console.log(
  "\n  And the props with no schema at all? They decode as JSONValue and mismatch\n" +
    "  silently at READ time, which is the failure mode a native host still has:",
)
const wrongTypeNode = decodeUINode(
  JSON.parse(`{"id":"b","type":"Button","props":{"disabled":"true"}}`),
  ["demo"],
)
const wrongTypeBool = boolValue(wrongTypeNode.props.get("disabled"))
console.log(
  `    props["disabled"] = .string("true")  ->  boolValue = ` +
    `${wrongTypeBool === null ? "nil" : wrongTypeBool}` +
    `  ->  isEnabled = ${!(wrongTypeBool ?? false)}`,
)
console.log(
  "    The string \"true\" is not a Bool, so the Optional is nil, so `?? false`\n" +
    "    wins and the button renders ENABLED. Statically typed does not mean\n" +
    "    semantically checked.",
)
// Every typed accessor fails the same quiet way, including the container one:
// asking for an object and getting a string yields nil, not an error.
console.log(
  `    props["disabled"] read as an object  ->  objectValue = ` +
    `${objectValue(wrongTypeNode.props.get("disabled")) === null ? "nil" : "a Map"}`,
)

// --- the registry ----------------------------------------------------------

console.log("\n=== 5. An unknown node type is rendered, not skipped ===")
const registry = ComponentRegistry.standard()
console.log(`  registry.isRegistered("Button")    -> ${registry.isRegistered("Button")}`)
console.log(`  registry.isRegistered("sparkline") -> ${registry.isRegistered("sparkline")}`)
console.log(
  `  registry.component("sparkline") === the fallback -> ` +
    `${registry.component("sparkline") === registry.fallbackComponent()}`,
)
console.log(
  "  `component(for:) -> Component` is NON-OPTIONAL. The TS registry's\n" +
    "  `get(type) -> T | undefined` makes every host write a fallback branch;\n" +
    "  Swift takes `init(fallback:)` so there is no branch to forget.",
)

const executed: string[] = []
const context: MountContext = {
  executeHandler: (handlerId, args) =>
    executed.push(`executeHandler("${handlerId}", [${args.map(preview).join(", ")}])`),
}

console.log("\n  the mounted view tree:")
for (const line of mount(tree.root as ShadowNode, registry, context)) {
  console.log(`    ${line}`)
}

// --- the event, as a string ------------------------------------------------

console.log("\n=== 6. The click, and what could not have crossed ===")
const button = tree.node("n3")
if (button === null) throw new Error("n3 missing")
const clickId = button.handlerId("onClick")
console.log(`  node n3's handler id: ${clickId === null ? "nil" : `"${clickId}"`}`)
if (clickId !== null) context.executeHandler(clickId, [{ kind: "string", value: "n3" }])
console.log(`  the host called back: ${executed[0]}`)

// Why it has to be an id: a function is not representable in the document.
const withFunction = { onClick: () => undefined, label: "Click me" }
console.log(`\n  JSON.stringify({onClick: fn, label}) -> ${JSON.stringify(withFunction)}`)
console.log(
  "  The function did not survive `JSON.stringify` and would not survive\n" +
    "  structured clone either. There is no bytes-level representation of a\n" +
    "  closure, so the protocol never tries: handlers travel as ids, and the\n" +
    "  host's only power is to name one back. Step 13 proves the same thing at\n" +
    "  a Worker boundary; a native host makes it unavoidable.",
)

// --- the revision guard ----------------------------------------------------

console.log("\n=== 7. The same batch, delivered twice ===")

const appendBatchJSON = `[
  {"type":"setText","nodeId":"n2","text":"Clicked 1 times"},
  {"type":"appendChild","parentId":"n1","node":
    {"id":"n6","type":"Text","props":{},"children":[
      {"id":"n6t","type":"#text","props":{},"children":[],"text":"last click: just now"}]}}
]`

const guarded = new ShadowTree()
const naive = new NaiveShadowTree()

const frame0: CommitBatch = { revision: 0, mutations: decodeMutations(FIRST_FRAME_JSON, "m") }
guarded.apply(frame0)
naive.apply({ revision: 0, mutations: decodeMutations(FIRST_FRAME_JSON, "m") })

// One real batch, revision 1.
const frame1: CommitBatch = { revision: 1, mutations: decodeMutations(appendBatchJSON, "m") }
console.log(`  apply(revision 1) -> guarded: ${guarded.apply(frame1)}`)
naive.apply({ revision: 1, mutations: decodeMutations(appendBatchJSON, "m") })
console.log(`  guarded children ${childIds(guarded.root)}   revision=${guarded.revision}`)
console.log(`  naive   children ${childIds(naive.root)}`)

const guardedDigestBefore = digest(guarded.root)
const naiveDigestBefore = digest(naive.root)

// The SAME batch again — a reconnect, a retried send, an at-least-once queue.
console.log("\n  ...the transport re-delivers revision 1 (reconnect / retry):")
const reapplied = guarded.apply({
  revision: 1,
  mutations: decodeMutations(appendBatchJSON, "m"),
})
naive.apply({ revision: 1, mutations: decodeMutations(appendBatchJSON, "m") })

console.log(`  guarded apply() returned ${reapplied}  (batch.revision <= revision)`)
console.log(`  guarded children ${childIds(guarded.root)}   revision=${guarded.revision}`)
console.log(`  naive   children ${childIds(naive.root)}   <- n6 twice`)
console.log(`  guarded tree unchanged? ${digest(guarded.root) === guardedDigestBefore}`)
console.log(`  naive   tree unchanged? ${digest(naive.root) === naiveDigestBefore}`)

// The guard catches more than duplicates: a batch that arrives LATE is also
// `<= revision` and is exactly as destructive.
console.log("\n  ...and a stale batch overtaken by a newer one:")
const frame2: CommitBatch = {
  revision: 2,
  mutations: decodeMutations(`[{"type":"setText","nodeId":"n2","text":"Clicked 2 times"}]`, "m"),
}
guarded.apply(frame2)
naive.apply(frame2)
const stale: CommitBatch = {
  revision: 1,
  mutations: decodeMutations(`[{"type":"setText","nodeId":"n2","text":"Clicked 1 times"}]`, "m"),
}
console.log(`  apply(revision 2) then apply(revision 1, late)`)
console.log(`  guarded returned ${guarded.apply(stale)} -> n2 = "${guarded.node("n2")?.text}"`)
naive.apply(stale)
console.log(
  `  naive  applied it     -> n2 = "${naive.node("n2")?.text}"   <- the UI went backwards`,
)

// The other half of the divergence: no structural sharing.
const rootIdentityBefore = guarded.root
guarded.apply({
  revision: 3,
  mutations: decodeMutations(`[{"type":"setText","nodeId":"n2","text":"Clicked 3 times"}]`, "m"),
})
console.log(
  `\n  root object identity after a mutation: ` +
    `${guarded.root === rootIdentityBefore ? "UNCHANGED" : "replaced"}`,
)
console.log(
  "  Step 02's MutableTree clones the whole path to the root on every mutation\n" +
    "  so a Svelte/React host can diff by reference equality. ShadowNode is a\n" +
    "  `final class` mutated in place: the AppKit mounter reconciles NSViews by\n" +
    "  id, so a fresh root would buy nothing and cost an allocation per node.",
)

// --- the summary this step exists to print ---------------------------------

console.log("\n=== 8. What the JS host gets for free, and the native host must state ===")
console.log(
  table(
    ["", "JS host (steps 08-09)", "native host (this step)"],
    [
      ["the tree arrives as", "a live object graph", "bytes; decode or refuse"],
      ["a node's props", "`props.disabled` — any", "`props[\"disabled\"]` -> JSONValue?"],
      ["value kinds", "whatever JS had", "enum: null/bool/number/string/array/object"],
      ["text children", "UINode | string, all the way down", "normalized to #text at decode"],
      ["an optional field", "`text?: string`, undefined", "`String?`, unwrapped at every use"],
      ["mutation kinds", "a union the compiler erases", "an enum; unknown kind throws"],
      ["validation", "Zod, optional, off by default", "mandatory; there is no untyped path"],
      ["an unknown node type", "`get()` -> undefined + a branch", "`init(fallback:)`, non-optional"],
      ["event handlers", "could be a function locally", "only a HandlerId string, ever"],
      ["a re-delivered batch", "applied again", "revision guard: ignored"],
      ["change detection", "clone the path, compare by ref", "mutate in place, reconcile by id"],
    ],
  ),
)

console.log(
  "\nEvery row on the right is a constraint the protocol was designed to satisfy\n" +
    "BEFORE the Swift host existed — which is why `UniviewNativeCore` is small\n" +
    "enough to rewrite per platform in about a week. Step 11 takes the same tree\n" +
    "somewhere with no views at all: a grid of characters.",
)
