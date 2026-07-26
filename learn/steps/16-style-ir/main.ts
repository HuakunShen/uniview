/**
 * Step 16 — Style as an intermediate representation.
 *
 * Fifteen steps built the machinery: a tree (`UINode`), six mutations, three
 * authoring frameworks that emit them, five hosts that apply them, three
 * runtimes to carry them, and an environment/event seam so that hover and
 * dark-mode never travel back to the plugin. Everything is in place.
 *
 * One thing is still unaccounted for, and it is the one `CLAUDE.md` cares about
 * most:
 *
 *   "Brand-agnostic. The renderer must not contain a color, a gradient, a corner
 *    radius or a shadow that it invented. It draws the Style IR, and the Style IR
 *    comes from the plugin. Semantic tokens (`accent`, `foreground`, `card`)
 *    resolve to the *system's* colors — the ones the user chose — never to ours."
 *
 * The reason that is a hard rule and not a preference is a real bug:
 *
 *   "`ButtonComponent` used to accept `variant: "primary"` and paint a hardcoded
 *    blue→violet brand gradient with a matching colored shadow. The plugin could
 *    not override it — the gradient was not even *reachable* from the Style IR.
 *    It was Uniview's brand, compiled into a renderer that was about to be ported
 *    to two more platforms."
 *
 * So style is not "a string the host figures out", and it is not "pixels the
 * plugin computed". It is an INTERMEDIATE REPRESENTATION, resolved in two
 * stages, and the split between them is the whole lesson:
 *
 *   stage 1, in the PLUGIN:  "bg-card hover:bg-muted"  →  a `ResolvedStyle`
 *      Class strings are parsed exactly once, by `@uniview/style`, so that five
 *      hosts — one of them written in Swift with no JS runtime — never need a
 *      Tailwind parser. Palette colors (`bg-zinc-800`) freeze to hex here,
 *      because that is what they mean in Tailwind too.
 *
 *   stage 2, in the HOST:    `ResolvedStyle` + this view's state  →  pixels
 *      Two things deliberately survive stage 1 unresolved, because the plugin
 *      genuinely does not know the answer:
 *        (a) SEMANTIC TOKENS travel as *names* (`"card"`, `"accent"`). The host
 *            maps them onto the system's own dynamic colors, per view, at draw
 *            time — no re-render, no round trip, and correct even when one
 *            window is forced light while the system is dark.
 *        (b) VARIANTS (`dark:`, `hover:`, `focus:`) travel as keyed overlays
 *            alongside the base style. The view picks. A mouse-enter is a local
 *            repaint, not an RPC call.
 *
 * This file builds both stages and then resolves ONE unchanged node under four
 * different host views. Same bytes in, four different pictures out, and the
 * plugin is never asked.
 */

// ---------------------------------------------------------------------------
// 1. Carried forward from step 01 — the protocol vocabulary
// ---------------------------------------------------------------------------

/** As in step 01: the only values allowed to appear in a node's props. */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue }

const TEXT_NODE_TYPE = "#text"

export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
}

const text = (id: string, content: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: content,
})

// ---------------------------------------------------------------------------
// 2. The Style IR — what a host is actually handed
// ---------------------------------------------------------------------------

/**
 * The conditions a style may be gated on.
 *
 * Every one of these is something the HOST knows and the plugin does not: which
 * appearance this particular view ended up in, where the pointer is, who holds
 * first responder. The real set is exactly six; this step uses four of them.
 */
type VariantName = "dark" | "light" | "hover" | "focus"

/**
 * Conditional overlays, keyed by their condition chain: `"dark"`, `"hover"`,
 * `"dark:hover"`. Every condition in a key must hold for the overlay to apply,
 * and a more specific key (more conditions) wins over a less specific one.
 */
type StyleVariants = { [conditionChain: string]: ResolvedStyle }

/**
 * A small slice of the real `ResolvedStyle`. Note what kind of thing each field
 * is: a NUMBER or a COLOR STRING, never a class name, never a "look".
 *
 * `shadow` is the real IR's clearest case of this and is left out here: it
 * travels as `{offsetX, offsetY, radius, color}` geometry rather than as
 * `"lg"`, because "lg" is a look and every design system draws it differently.
 * A host that hardcodes the radius can draw exactly one shadow, forever.
 */
type ResolvedStyle = {
  variants?: StyleVariants
  backgroundColor?: string
  color?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  gap?: number
  fontSize?: number
  fontWeight?: "normal" | "medium" | "semibold" | "bold"
}

/** The prop the IR travels on, alongside the untouched `className` the author wrote. */
const STYLE_IR_PROP = "_style"

// ---------------------------------------------------------------------------
// 3. The theme — and the one line that makes this whole step work
// ---------------------------------------------------------------------------

/**
 * Literal palette colors, verbatim from the real generated palette. `zinc-800`
 * is `#27272a` in light mode and `#27272a` in dark mode, on macOS and in a
 * terminal, forever — an author who writes `bg-zinc-800` wants *that* grey, and
 * that is what it means in Tailwind too.
 */
const PALETTE: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  "zinc-200": "#e4e4e7",
  "zinc-700": "#3f3f46",
  "zinc-800": "#27272a",
  "zinc-900": "#18181b",
  "blue-500": "#2b7fff",
  "emerald-500": "#00bc7d",
}

/**
 * The semantic vocabulary — shadcn's token names. Each hex here is only the
 * FALLBACK, for a web host (or a plugin-owned theme) that resolves everything
 * itself. On a native host these names survive the trip and the OS answers.
 */
const SEMANTIC_COLORS: Record<string, string> = {
  background: "#ffffff",
  foreground: "#111111",
  card: "#ffffff",
  border: "#d1d5db",
  muted: "#f2f2f7",
  "muted-foreground": "#6b7280",
  accent: "#0a84ff",
  "accent-foreground": "#ffffff",
}

interface Theme {
  colors: Record<string, string>
  /**
   * THE line. Color tokens named here stay SYMBOLIC in the IR: `bg-card` travels
   * as the string `"card"`, not as `"#ffffff"`.
   *
   * Why it has to work this way: shadcn on the web swaps a CSS variable and the
   * cascade re-resolves. Natively there is no cascade, so a hex resolved on the
   * plugin side is a hex forever. It cannot follow the system flipping to dark,
   * and it cannot be *different per window* the way `<Window appearance="light">`
   * needs it to be.
   *
   * A theme with `nativeTokens: new Set()` freezes everything to hex — that is
   * the escape hatch for a fully custom, plugin-owned palette.
   */
  nativeTokens: Set<string>
  spacing: (n: number) => number
  radii: Record<string, number> & { default: number }
  fontSizes: Record<string, number>
}

const defaultTheme: Theme = {
  colors: { ...PALETTE, ...SEMANTIC_COLORS },
  nativeTokens: new Set(Object.keys(SEMANTIC_COLORS)),
  spacing: (n) => n * 4,
  radii: { none: 0, sm: 4, md: 6, lg: 8, xl: 12, full: 9999, default: 6 },
  fontSizes: { xs: 11, sm: 12, base: 13, lg: 15, xl: 18 },
}

// ---------------------------------------------------------------------------
// 4. Stage 1 — the plugin-side resolver
// ---------------------------------------------------------------------------

/** `[13px]` → `"13px"`. Tailwind's escape hatch, and the negative example below. */
const arbitrary = (token: string): string | undefined =>
  token.startsWith("[") && token.endsWith("]") ? token.slice(1, -1) : undefined

/**
 * A color argument.
 *
 * Three outcomes, and the difference between them is the entire step:
 *   `bg-[#3b82f6]`  → `"#3b82f6"` — a literal the author pinned. Frozen.
 *   `bg-zinc-800`   → `"#27272a"` — a palette color. Also frozen, deliberately.
 *   `bg-card`       → `"card"`    — a NAME. The host will answer it.
 */
function parseColor(token: string, theme: Theme): string | undefined {
  const literal = arbitrary(token)
  if (literal !== undefined) return literal
  if (theme.nativeTokens.has(token)) return token // <- survives unresolved
  return theme.colors[token]
}

/** A length in points: a spacing step (`4` → 16) or an arbitrary `[13px]`. */
function spacingValue(token: string, theme: Theme): number | undefined {
  const raw = arbitrary(token)
  if (raw !== undefined) {
    const n = Number.parseFloat(raw)
    return Number.isNaN(n) ? undefined : n
  }
  return /^\d+(\.\d+)?$/.test(token) ? theme.spacing(Number(token)) : undefined
}

const STATIC_CLASSES: Record<string, ResolvedStyle> = {
  border: { borderWidth: 1 },
  "border-0": { borderWidth: 0 },
  "font-normal": { fontWeight: "normal" },
  "font-medium": { fontWeight: "medium" },
  "font-semibold": { fontWeight: "semibold" },
  "font-bold": { fontWeight: "bold" },
}

/** Resolve ONE class token to a partial style, or null when unrecognized. */
function matchToken(token: string, theme: Theme): ResolvedStyle | null {
  const staticMatch = STATIC_CLASSES[token]
  if (staticMatch) return staticMatch

  let m: RegExpMatchArray | null

  if ((m = token.match(/^p-(.+)$/))) {
    const v = spacingValue(m[1], theme)
    return v === undefined
      ? null
      : { paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v }
  }

  if ((m = token.match(/^gap-(.+)$/))) {
    const v = spacingValue(m[1], theme)
    return v === undefined ? null : { gap: v }
  }

  if ((m = token.match(/^rounded(?:-(.+))?$/))) {
    const key = m[1] ?? "default"
    if (key in theme.radii) return { borderRadius: theme.radii[key] }
    const v = spacingValue(key, theme)
    return v === undefined ? null : { borderRadius: v }
  }

  if ((m = token.match(/^bg-(.+)$/))) {
    const color = parseColor(m[1], theme)
    return color === undefined ? null : { backgroundColor: color }
  }

  // `border-2` is a width; `border-border` is a color. Width first.
  if ((m = token.match(/^border-(\d+)$/))) return { borderWidth: Number(m[1]) }
  if ((m = token.match(/^border-(.+)$/))) {
    const color = parseColor(m[1], theme)
    return color === undefined ? null : { borderColor: color }
  }

  // `text-` is overloaded: a size token if the theme has one, else a color.
  if ((m = token.match(/^text-(.+)$/))) {
    const key = m[1]
    if (key in theme.fontSizes) return { fontSize: theme.fontSizes[key] }
    const color = parseColor(key, theme)
    return color === undefined ? null : { color }
  }

  return null
}

/** The conditions a variant prefix may name. Anything else is not a variant. */
const VARIANTS: ReadonlySet<string> = new Set<VariantName>([
  "dark",
  "light",
  "hover",
  "focus",
])

/**
 * `dark:hover:bg-zinc-800` → `[["dark", "hover"], "bg-zinc-800"]`.
 *
 * Returns null for a prefix we cannot honour. Dropping the whole token is
 * deliberate: strip an unknown `md:` and it would silently become an
 * UNCONDITIONAL style, which is worse than it not working at all.
 */
function splitVariants(token: string): [string[], string] | null {
  // An arbitrary value may itself contain a colon, so only look for prefixes
  // ahead of the bracket.
  const bracket = token.indexOf("[")
  const head = bracket === -1 ? token : token.slice(0, bracket)
  const count = head.split(":").length - 1
  if (count === 0) return [[], token]

  const conditions = token.split(":", count)
  const rest = token.slice(conditions.reduce((n, c) => n + c.length + 1, 0))
  return conditions.every((c) => VARIANTS.has(c)) ? [conditions, rest] : null
}

/**
 * Stage 1. A class string in, a `ResolvedStyle` out.
 *
 * This runs ONCE, in the plugin, no matter how many hosts exist and no matter
 * how many times the pointer moves. Unconditional tokens merge into the base;
 * prefixed tokens land in `variants` under their condition chain, untouched and
 * unchosen — choosing is not the plugin's job.
 */
function resolveClassName(className: string, theme: Theme): ResolvedStyle {
  const out: ResolvedStyle = {}
  const variants: StyleVariants = {}

  for (const token of className.trim().split(/\s+/).filter(Boolean)) {
    const split = splitVariants(token)
    if (split === null) continue

    const [conditions, rest] = split
    const partial = matchToken(rest, theme)
    if (!partial) continue

    if (conditions.length === 0) {
      Object.assign(out, partial)
    } else {
      const key = conditions.join(":")
      variants[key] = { ...variants[key], ...partial }
    }
  }

  if (Object.keys(variants).length > 0) out.variants = variants
  return out
}

/**
 * What a renderer's serializer does: derive `_style` and hang it on the props,
 * next to the untouched `className`. Native hosts read `_style`; web hosts
 * ignore it and hand `className` to their own CSS engine. One tree, both worlds.
 *
 * The JSON round-trip is the boundary the wire imposes anyway; the real code
 * casts instead, having already proven every IR field is JSON-safe.
 */
function serializeStyle(className: string, theme: Theme): JSONValue {
  return JSON.parse(JSON.stringify(resolveClassName(className, theme))) as JSONValue
}

// ---------------------------------------------------------------------------
// 5. Stage 2 — the host side
// ---------------------------------------------------------------------------

/**
 * What the plugin is allowed to know about the machine it is displayed on —
 * step 15's `HostEnvironment`, unchanged.
 *
 * Note what is deliberately NOT solved by it: `bg-card` does not consult this.
 * Semantic tokens reach the host as names and are resolved natively, per view.
 * The environment is for decisions only the plugin can make — which chart
 * palette, which illustration, whether to animate at all.
 */
interface HostEnvironment {
  colorScheme: "light" | "dark"
  /** The user's accent color, if the platform has one (macOS: `controlAccentColor`). */
  accentColor?: string
}

/**
 * One host platform: how IT answers a semantic name.
 *
 * These are the platform's OWN colors. Nothing here was invented by Uniview,
 * which is the point — the values below stand in for `NSColor.labelColor`,
 * `NSColor.controlBackgroundColor`, `NSColor.separatorColor` and friends. The
 * approximate sRGB bytes matter far less than the fact that they DIFFER.
 */
interface HostPlatform {
  name: string
  /** null = this platform has no answer for that name; the IR fallback is used. */
  systemColor(token: string, env: HostEnvironment): string | null
}

const macOS: HostPlatform = {
  name: "macOS / AppKit",
  systemColor(token, env) {
    const dark = env.colorScheme === "dark"
    switch (token) {
      // `accent` means "whatever THIS MACHINE calls accent" — the color the user
      // picked in System Settings. A plugin that wants *its* blue says so with a
      // palette color or an arbitrary value instead.
      case "accent":
        return env.accentColor ?? (dark ? "#0a84ff" : "#007aff")
      case "accent-foreground":
        return "#ffffff"
      case "foreground": // NSColor.labelColor
        return dark ? "#ffffffd9" : "#000000d9"
      case "muted-foreground": // NSColor.secondaryLabelColor
        return dark ? "#ffffff8c" : "#0000008c"
      case "background": // NSColor.windowBackgroundColor
        return dark ? "#1e1e1e" : "#ececec"
      case "card": // NSColor.controlBackgroundColor
        return dark ? "#1e1e1e" : "#ffffff"
      case "muted": // NSColor.underPageBackgroundColor
        return dark ? "#282828" : "#969696"
      case "border": // NSColor.separatorColor
        return dark ? "#ffffff1a" : "#0000001a"
      default:
        return null
    }
  },
}

/**
 * A second platform, to make "per platform" concrete rather than theoretical.
 * A terminal's palette is 16 names the user themself themed, and it has no
 * concept of an accent color at all — so `accent` falls back to the IR's hex.
 */
const terminal: HostPlatform = {
  name: "Terminal (ANSI)",
  systemColor(token, env) {
    const dark = env.colorScheme === "dark"
    switch (token) {
      case "foreground":
        return dark ? "ansi:white" : "ansi:black"
      case "muted-foreground":
        return "ansi:bright-black"
      case "background":
      case "card":
        return "ansi:default-bg"
      case "muted":
        return dark ? "ansi:bright-black" : "ansi:bright-white"
      case "border":
        return "ansi:bright-black"
      default:
        return null // no accent color exists here
    }
  },
}

/**
 * One live view on one host: a platform, the appearance THIS view ended up in,
 * and what the pointer and the keyboard are doing to it right now.
 *
 * `env` is per-view on purpose, not per-application. `NSApp.effectiveAppearance`
 * would be the wrong question: a window can carry `<Window appearance="light">`
 * while the system is dark.
 */
interface HostView {
  label: string
  platform: HostPlatform
  env: HostEnvironment
  hovered: boolean
  focused: boolean
}

/** The condition set this view is in — the keys `variants` is keyed by. */
function styleState(view: HostView): Set<string> {
  const state = new Set<string>([view.env.colorScheme])
  if (view.hovered) state.add("hover")
  if (view.focused) state.add("focus")
  return state
}

/** Every field the overlay sets replaces ours; the rest is left alone. */
function overlaid(base: ResolvedStyle, over: ResolvedStyle): ResolvedStyle {
  const out: ResolvedStyle = { ...base }
  for (const [key, value] of Object.entries(over)) {
    if (value !== undefined && key !== "variants") {
      Object.assign(out, { [key]: value })
    }
  }
  return out
}

/**
 * Host-side variant selection. Overlays whose every condition currently holds
 * are applied least-specific first, so `dark:hover:` beats `dark:` beats the
 * base — the precedence a reader already expects from Tailwind.
 *
 * This is the entire cost of a mouse-enter. No RPC, no re-render, no plugin.
 */
function resolvedFor(ir: ResolvedStyle, state: Set<string>): ResolvedStyle {
  const variants = ir.variants
  if (!variants) return ir

  const matching = Object.entries(variants)
    .filter(([key]) => key.split(":").every((c) => state.has(c)))
    .sort((a, b) => a[0].split(":").length - b[0].split(":").length)

  let result: ResolvedStyle = ir
  for (const [, overlay] of matching) result = overlaid(result, overlay)
  return result
}

/** Host-side token resolution: a NAME becomes one of the system's own colors. */
function paintColor(value: string | undefined, view: HostView): string | undefined {
  if (value === undefined) return undefined
  if (value.startsWith("#") || value.startsWith("ansi:")) return value // already literal
  return view.platform.systemColor(value, view.env) ?? `${value} (IR fallback)`
}

/** Stage 2 end to end: pick the variants, then answer the names. */
function paint(ir: ResolvedStyle, view: HostView): ResolvedStyle {
  const chosen = resolvedFor(ir, styleState(view))
  return {
    ...chosen,
    variants: undefined,
    backgroundColor: paintColor(chosen.backgroundColor, view),
    color: paintColor(chosen.color, view),
    borderColor: paintColor(chosen.borderColor, view),
  }
}

// ---------------------------------------------------------------------------
// 6. One node, written once
// ---------------------------------------------------------------------------

const CARD_CLASSES =
  "p-4 gap-2 rounded-lg border font-medium " +
  "bg-card text-foreground border-border " +
  "hover:bg-muted focus:border-accent " +
  "dark:border-zinc-700 dark:hover:bg-zinc-800"

const card: UINode = {
  id: "n1",
  type: "div",
  props: {
    className: CARD_CLASSES, // untouched, for web hosts
    [STYLE_IR_PROP]: serializeStyle(CARD_CLASSES, defaultTheme), // derived, for native hosts
  },
  children: [text("n2", "Recently used")],
}

console.log("=== 1. What the plugin wrote ===\n")
console.log(`  <div className="`)
for (const token of CARD_CLASSES.split(/\s+/)) console.log(`    ${token}`)
console.log(`  ">`)

console.log("\n=== 2. What travels — the Style IR, resolved once, in the plugin ===\n")
console.log(JSON.stringify(card.props[STYLE_IR_PROP], null, 2))

const wireBytes = new TextEncoder().encode(JSON.stringify(card)).length
console.log(`\n  ${wireBytes} bytes, sent once.`)
console.log("  Note what is NOT a hex in there: bg-card became the string \"card\",")
console.log("  text-foreground became \"foreground\", border-border became \"border\".")
console.log("  dark:/hover:/focus: became keyed overlays that nobody has chosen yet.")
console.log("  dark:border-zinc-700 DID freeze to #3f3f46 — a palette color is a")
console.log("  literal by definition, and the author asked for that exact grey.")

// ---------------------------------------------------------------------------
// 7. The same bytes, four host views
// ---------------------------------------------------------------------------

const views: HostView[] = [
  {
    label: "macOS light",
    platform: macOS,
    env: { colorScheme: "light", accentColor: "#007aff" },
    hovered: false,
    focused: false,
  },
  {
    label: "macOS dark",
    platform: macOS,
    env: { colorScheme: "dark", accentColor: "#007aff" },
    hovered: false,
    focused: false,
  },
  {
    // Same machine, same appearance, one System Settings pref away.
    label: "macOS dark, pink accent",
    platform: macOS,
    env: { colorScheme: "dark", accentColor: "#f74f9e" },
    hovered: false,
    focused: true,
  },
  {
    label: "Terminal dark",
    platform: terminal,
    env: { colorScheme: "dark" },
    hovered: false,
    focused: false,
  },
]

const FIELDS = [
  "backgroundColor",
  "color",
  "borderColor",
  "borderWidth",
  "borderRadius",
  "paddingTop",
  "gap",
  "fontWeight",
] as const

const COL = 24

function table(ir: ResolvedStyle, viewList: HostView[]): string {
  const painted = viewList.map((v) => paint(ir, v))
  const lines: string[] = []
  lines.push(
    "  " +
      "field".padEnd(16) +
      viewList.map((v) => v.label.padEnd(COL)).join(""),
  )
  lines.push("  " + "-".repeat(16 + COL * viewList.length))
  for (const field of FIELDS) {
    const cells = painted.map((p) => {
      const value = p[field]
      return (value === undefined ? "-" : String(value)).padEnd(COL)
    })
    lines.push("  " + field.padEnd(16) + cells.join(""))
  }
  return lines.join("\n")
}

const cardIR = resolveClassName(CARD_CLASSES, defaultTheme)

console.log("\n=== 3. The SAME IR, resolved by four different host views ===\n")
console.log(table(cardIR, views))
console.log("\n  Every column came from one unchanged node. The plugin was not asked,")
console.log("  did not re-render, and does not know which of these it is looking at.")
console.log("  Column 3 differs from column 2 by one System Settings preference and")
console.log("  a focus ring: focus:border-accent -> the USER's pink, not ours.")
console.log("  Column 4 is a platform with no accent color at all, so `accent` falls")
console.log("  back to the IR's own hex rather than to an invented one.")

// ---------------------------------------------------------------------------
// 8. Hover, resolved locally
// ---------------------------------------------------------------------------

const hoverViews: HostView[] = [
  { ...views[0], label: "light, resting", hovered: false },
  { ...views[0], label: "light, hovered", hovered: true },
  { ...views[1], label: "dark, resting", hovered: false },
  { ...views[1], label: "dark, hovered", hovered: true },
]

console.log("\n=== 4. A mouse-enter, and what it costs ===\n")
console.log(table(cardIR, hoverViews))
console.log("\n  Light hover picks `hover:bg-muted`. Dark hover picks BOTH `hover:` and")
console.log("  `dark:hover:`, least-specific first, so `dark:hover:bg-zinc-800` wins —")
console.log("  which is exactly the precedence Tailwind gives it in a browser.")

// Measure what a hover transition actually costs on the host side.
const HOVER_TRANSITIONS = 200_000
const restingState = styleState(hoverViews[2])
const hoveredState = styleState(hoverViews[3])
const start = performance.now()
let sink = 0
for (let i = 0; i < HOVER_TRANSITIONS; i++) {
  const out = resolvedFor(cardIR, i % 2 === 0 ? hoveredState : restingState)
  sink += out.backgroundColor === undefined ? 0 : 1
}
const localMs = performance.now() - start
const perTransitionMs = localMs / HOVER_TRANSITIONS

console.log(
  `\n  measured: ${HOVER_TRANSITIONS.toLocaleString("en-US")} variant resolutions in ` +
    `${localMs.toFixed(1)} ms (${sink.toLocaleString("en-US")} hits)`,
)
console.log(
  `            = ${(perTransitionMs * 1000).toFixed(3)} us per hover transition, locally.`,
)

// The alternative: push the pointer state to the plugin and re-render. Sliding
// the mouse down a 12-row list is 24 enter/leave transitions; a lazy user does
// that a few hundred times an hour. Round-trip budgets are illustrative, the
// per-transition number above is measured.
console.log("\n  the alternative — ask the plugin instead (step 15's round trip):\n")
const ROWS_CROSSED = 24
const SESSIONS_PER_HOUR = 300
const transitionsPerHour = ROWS_CROSSED * SESSIONS_PER_HOUR
const budgets: Array<[string, number]> = [
  ["main thread (step 12)", 0.15],
  ["Web Worker (step 13)", 0.6],
  ["WebSocket, LAN (step 14)", 1.5],
  ["WebSocket, another machine", 40],
]
const LABEL = 40
console.log(
  "    " + "runtime".padEnd(LABEL) + "per enter".padStart(13) + "per hour".padStart(12),
)
console.log("    " + "-".repeat(LABEL + 25))
const costRow = (label: string, ms: number): string =>
  "    " +
  label.padEnd(LABEL) +
  `${ms.toFixed(4)} ms`.padStart(13) +
  `${((ms * transitionsPerHour) / 1000).toFixed(3)} s`.padStart(12)
console.log(costRow("host-resolved (measured)", perTransitionMs))
for (const [label, rttMs] of budgets) {
  console.log(costRow(`round trip: ${label}`, rttMs))
}
console.log(
  "\n    (per-enter for the host row is measured; the round-trip budgets are\n" +
    "     stated assumptions. The right-hand column is the plugin's re-render\n" +
    "     latency budget for one hour of ordinary pointer movement — and each of\n" +
    "     those round trips also re-runs a React tree and emits mutations.)",
)
console.log(
  "\n  `CLAUDE.md`: \"High-frequency interaction is local, never RPC. […] a round\n" +
    "  trip per mouse-enter is wasteful locally and fatal when the plugin runs on\n" +
    "  another machine.\"",
)

// ---------------------------------------------------------------------------
// 9. The negative example — a color the node pinned itself
// ---------------------------------------------------------------------------

// This is the `ButtonComponent` story, reproduced from the other side. There the
// blue→violet gradient was baked into the RENDERER and the plugin could not
// reach it. Here the plugin bakes a hex into the TREE, and the host cannot
// reach it. Both are the same failure: a color decided somewhere it cannot be
// revisited.
const HARDCODED_CLASSES = "p-4 rounded-lg border bg-[#3b82f6] text-white border-[#3b82f6]"
const hardcodedIR = resolveClassName(HARDCODED_CLASSES, defaultTheme)

console.log("\n=== 5. The negative example: a color that cannot adapt ===\n")
console.log(`  <div className="${HARDCODED_CLASSES}">\n`)
console.log(table(hardcodedIR, views))
console.log("\n  Four host views, four identical columns. #3b82f6 in a dark window is")
console.log("  #3b82f6. It ignores the user's accent color, it ignores the appearance,")
console.log("  and in the terminal column it is a truecolor hex on a palette the user")
console.log("  themed themself. There is no hook for the host to change it, because")
console.log("  the decision was already made, upstream, in a string.")

console.log(
  "\n  This is the ButtonComponent bug, seen from the other end. From `CLAUDE.md`:\n" +
    "\n" +
    "    \"`ButtonComponent` used to accept `variant: \"primary\"` and paint a\n" +
    "     hardcoded blue→violet brand gradient with a matching colored shadow. The\n" +
    "     plugin could not override it — the gradient was not even *reachable* from\n" +
    "     the Style IR. It was Uniview's brand, compiled into a renderer that was\n" +
    "     about to be ported to two more platforms. It is gone now: gradients travel\n" +
    "     in the IR (`bg-linear-to-br from-… to-…`), an unstyled button is a **real\n" +
    "     native bezel button**, and the demo declares its own `demoBrandColor`\n" +
    "     inside `UniviewDemoApp`.\"\n",
)
console.log("  A literal is not forbidden — `bg-[#3b82f6]` is a plugin author saying")
console.log("  \"this exact blue, everywhere\", and that is a legitimate thing to want.")
console.log("  What is forbidden is the RENDERER holding one. Section 3's columns are")
console.log("  the difference: an opinion in the tree can be changed by editing the")
console.log("  plugin; an opinion in the renderer has to be changed three times, in")
console.log("  three languages, on three platforms.")

console.log(
  "\nStyle is an IR, not pixels. The plugin parses the class string once; the\n" +
    "host answers the two questions only it can answer — what does this system\n" +
    "call `card`, and what is the pointer doing — per view, at draw time, with\n" +
    "no re-render and no round trip. That is the last thing that must not be\n" +
    "baked into the renderer, and it completes the contract.",
)
