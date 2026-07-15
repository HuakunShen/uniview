import { defaultTheme, type Theme } from "./theme";
import type {
  Dimension,
  GradientDirection,
  LinearGradient,
  ResolvedStyle,
  StyleInput,
  StyleVariants,
  VariantName,
} from "./types";

/**
 * The Tailwind-subset resolver. Runs plugin-side: a native host receives the
 * finished `ResolvedStyle` and never parses a class name.
 *
 * Two places where this deliberately follows *CSS* semantics rather than a
 * naive token mapping, because plugins are authored against CSS:
 *
 *  - `flex` sets `flexDirection: "row"`. CSS's `display:flex` defaults to row,
 *    but a flex engine (Yoga) defaults to column, so treating `flex` as a no-op
 *    would silently stack every `<div className="flex gap-2">` vertically.
 *  - `space-y-N` / `space-x-N` become `gap`. Tailwind implements them as margins
 *    on the children; on a flex engine `gap` is the equivalent, and every native
 *    container is a flex box. (The axis distinction is lost — a `space-y` on a
 *    row will space it horizontally.)
 */

/** Classes with a fixed mapping (no argument). */
const STATIC_CLASSES: Record<string, ResolvedStyle> = {
  flex: { flexDirection: "row" },
  "flex-row": { flexDirection: "row" },
  "flex-col": { flexDirection: "column" },
  "flex-row-reverse": { flexDirection: "row-reverse" },
  "flex-col-reverse": { flexDirection: "column-reverse" },
  "flex-wrap": { flexWrap: "wrap" },
  "flex-nowrap": { flexWrap: "nowrap" },
  "flex-1": { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  "flex-auto": { flexGrow: 1, flexShrink: 1, flexBasis: "auto" },
  "flex-none": { flexGrow: 0, flexShrink: 0 },
  grow: { flexGrow: 1 },
  "grow-0": { flexGrow: 0 },
  shrink: { flexShrink: 1 },
  "shrink-0": { flexShrink: 0 },
  "items-start": { alignItems: "flex-start" },
  "items-center": { alignItems: "center" },
  "items-end": { alignItems: "flex-end" },
  "items-stretch": { alignItems: "stretch" },
  "items-baseline": { alignItems: "baseline" },
  "justify-start": { justifyContent: "flex-start" },
  "justify-center": { justifyContent: "center" },
  "justify-end": { justifyContent: "flex-end" },
  "justify-between": { justifyContent: "space-between" },
  "justify-around": { justifyContent: "space-around" },
  "justify-evenly": { justifyContent: "space-evenly" },
  "self-auto": { alignSelf: "auto" },
  "self-start": { alignSelf: "flex-start" },
  "self-center": { alignSelf: "center" },
  "self-end": { alignSelf: "flex-end" },
  "self-stretch": { alignSelf: "stretch" },
  relative: { position: "relative" },
  absolute: { position: "absolute" },
  // `hidden` removes the box from layout, not just from view — it is Yoga's
  // `display: none`, so the siblings close the gap.
  hidden: { display: "none" },
  block: { display: "flex" },
  "overflow-visible": { overflow: "visible" },
  "overflow-hidden": { overflow: "hidden" },
  "overflow-scroll": { overflow: "scroll" },
  "overflow-auto": { overflow: "scroll" },
  border: { borderWidth: 1 },
  "border-0": { borderWidth: 0 },
  "font-normal": { fontWeight: "normal" },
  "font-medium": { fontWeight: "medium" },
  "font-semibold": { fontWeight: "semibold" },
  "font-bold": { fontWeight: "bold" },
  italic: { fontStyle: "italic" },
  "not-italic": { fontStyle: "normal" },
  underline: { textDecoration: "underline" },
  "line-through": { textDecoration: "line-through" },
  "no-underline": { textDecoration: "none" },
  truncate: { maxLines: 1 },
  "text-left": { textAlign: "left" },
  "text-center": { textAlign: "center" },
  "text-right": { textAlign: "right" },
};

/**
 * Rules whose argument is a length on the spacing scale. The argument is matched
 * loosely (`(.+)`) and handed to `spacingValue`, so an arbitrary value
 * (`p-[13px]`) works everywhere a step (`p-4`) does, without a second rule table.
 */
const EDGE_RULES: Array<[RegExp, (v: number) => ResolvedStyle]> = [
  [/^gap-(.+)$/, (v) => ({ gap: v })],
  // Tailwind spaces children with margins; a flex engine spaces them with gap.
  [/^space-[xy]-(.+)$/, (v) => ({ gap: v })],
  [
    /^p-(.+)$/,
    (v) => ({
      paddingTop: v,
      paddingRight: v,
      paddingBottom: v,
      paddingLeft: v,
    }),
  ],
  [/^px-(.+)$/, (v) => ({ paddingLeft: v, paddingRight: v })],
  [/^py-(.+)$/, (v) => ({ paddingTop: v, paddingBottom: v })],
  [/^pt-(.+)$/, (v) => ({ paddingTop: v })],
  [/^pr-(.+)$/, (v) => ({ paddingRight: v })],
  [/^pb-(.+)$/, (v) => ({ paddingBottom: v })],
  [/^pl-(.+)$/, (v) => ({ paddingLeft: v })],
  [
    /^m-(.+)$/,
    (v) => ({ marginTop: v, marginRight: v, marginBottom: v, marginLeft: v }),
  ],
  [/^mx-(.+)$/, (v) => ({ marginLeft: v, marginRight: v })],
  [/^my-(.+)$/, (v) => ({ marginTop: v, marginBottom: v })],
  [/^mt-(.+)$/, (v) => ({ marginTop: v })],
  [/^mr-(.+)$/, (v) => ({ marginRight: v })],
  [/^mb-(.+)$/, (v) => ({ marginBottom: v })],
  [/^ml-(.+)$/, (v) => ({ marginLeft: v })],
  // Position offsets. `absolute` without these could declare a box out of flow
  // and then had no way to say *where* — the IR always had the fields.
  // The axis rules come FIRST: `/^inset-(.+)$/` would otherwise swallow
  // `inset-x-2` with the argument "x-2" and resolve it to nothing.
  [/^inset-x-(.+)$/, (v) => ({ left: v, right: v })],
  [/^inset-y-(.+)$/, (v) => ({ top: v, bottom: v })],
  [/^inset-(.+)$/, (v) => ({ top: v, right: v, bottom: v, left: v })],
  [/^top-(.+)$/, (v) => ({ top: v })],
  [/^right-(.+)$/, (v) => ({ right: v })],
  [/^bottom-(.+)$/, (v) => ({ bottom: v })],
  [/^left-(.+)$/, (v) => ({ left: v })],
];

/** Rules that a leading `-` may negate (`-mt-2`, `-inset-1`). Lengths only. */
const NEGATABLE = /^(m[xytrbl]?|inset(-[xy])?|top|right|bottom|left|z)-/;

const AUTO_MARGINS: Record<string, ResolvedStyle> = {
  "m-auto": {
    marginTop: "auto",
    marginRight: "auto",
    marginBottom: "auto",
    marginLeft: "auto",
  },
  "mx-auto": { marginLeft: "auto", marginRight: "auto" },
  "my-auto": { marginTop: "auto", marginBottom: "auto" },
  "mt-auto": { marginTop: "auto" },
  "mr-auto": { marginRight: "auto" },
  "mb-auto": { marginBottom: "auto" },
  "ml-auto": { marginLeft: "auto" },
};

const SIZE_RULES: Array<[RegExp, (d: Dimension) => ResolvedStyle]> = [
  [/^w-(.+)$/, (d) => ({ width: d })],
  [/^h-(.+)$/, (d) => ({ height: d })],
  [/^min-w-(.+)$/, (d) => ({ minWidth: d })],
  [/^min-h-(.+)$/, (d) => ({ minHeight: d })],
  [/^max-w-(.+)$/, (d) => ({ maxWidth: d })],
  [/^max-h-(.+)$/, (d) => ({ maxHeight: d })],
];

/**
 * The contents of an arbitrary value: `[13px]` → `"13px"`. Tailwind's escape
 * hatch, and the answer to every "the scale doesn't have the number I need".
 */
function arbitrary(token: string): string | undefined {
  return token.startsWith("[") && token.endsWith("]")
    ? token.slice(1, -1).replace(/_/g, " ") // Tailwind spells spaces `_`
    : undefined;
}

/** A length in points: a spacing step (`4` → 16), or an arbitrary `[13px]`. */
function spacingValue(token: string, theme: Theme): number | undefined {
  const raw = arbitrary(token);
  if (raw !== undefined) {
    const n = Number.parseFloat(raw);
    return Number.isNaN(n) ? undefined : n; // `px`/unitless both land here
  }
  if (token === "px") return 1; // Tailwind's one-pixel step
  return /^\d+(\.\d+)?$/.test(token) ? theme.spacing(Number(token)) : undefined;
}

/**
 * A sizing argument: `full`, `auto`, `screen`, a named size (`md` → the theme's
 * size scale), a fraction (`1/2` → `"50%"`), an arbitrary `[137px]` / `[50%]`,
 * or a spacing step (`10` → 40px).
 */
function parseDimension(token: string, theme: Theme): Dimension | undefined {
  if (token === "full") return "100%";
  if (token === "auto") return "auto";

  const raw = arbitrary(token);
  if (raw !== undefined) {
    if (raw.endsWith("%")) {
      const pct = Number.parseFloat(raw);
      return Number.isNaN(pct) ? undefined : (`${pct}%` as Dimension);
    }
    const n = Number.parseFloat(raw);
    return Number.isNaN(n) ? undefined : n;
  }

  if (token in theme.sizes) return theme.sizes[token];

  const fraction = token.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const pct = (Number(fraction[1]) / Number(fraction[2])) * 100;
    return `${Number(pct.toFixed(4))}%`;
  }

  return spacingValue(token, theme);
}

/** `0` → `"00"`, `255` → `"ff"`. */
function alphaByte(fraction: number): string {
  const byte = Math.round(Math.max(0, Math.min(1, fraction)) * 255);
  return byte.toString(16).padStart(2, "0");
}

/**
 * A color argument, with Tailwind's optional `/N` alpha suffix.
 *
 * A token in `theme.nativeTokens` keeps its NAME (`card`, `card/50`): the native
 * host owns what it looks like, so that it can keep looking right when the
 * appearance changes. Everything else resolves to a literal, and its alpha folds
 * into an 8-digit `#rrggbbaa` — the form native color parsers already take, so no
 * host needs an `rgba()` parser.
 */
function parseColor(token: string, theme: Theme): string | undefined {
  const literal = arbitrary(token);
  if (literal !== undefined) return literal; // `bg-[#ff0000]`, `text-[rgb(…)]`

  const slash = token.lastIndexOf("/");
  const name = slash === -1 ? token : token.slice(0, slash);

  if (theme.nativeTokens.has(name)) return token;

  const base = theme.colors[name];
  if (base === undefined) return undefined;
  if (slash === -1) return base;

  const percent = Number(token.slice(slash + 1));
  if (Number.isNaN(percent)) return undefined;
  // Only a 6-digit hex can take an alpha byte; anything else is returned as-is.
  if (!/^#[0-9a-f]{6}$/i.test(base)) return base;
  return base + alphaByte(percent / 100);
}

/** Resolve one class token to a partial style, or null when unrecognized. */
function matchToken(token: string, theme: Theme): ResolvedStyle | null {
  // `-mt-2` / `-inset-1`. Only length rules can be negated; negating, say, a
  // border radius would be nonsense, so the base has to be on the allowlist.
  if (token.startsWith("-") && NEGATABLE.test(token.slice(1))) {
    const positive = matchToken(token.slice(1), theme);
    if (!positive) return null;
    return Object.fromEntries(
      Object.entries(positive).map(([key, value]) => [
        key,
        typeof value === "number" ? -value : value,
      ]),
    );
  }

  const staticMatch = STATIC_CLASSES[token] ?? AUTO_MARGINS[token];
  if (staticMatch) return staticMatch;

  for (const [pattern, build] of EDGE_RULES) {
    const m = token.match(pattern);
    if (!m) continue;
    const value = spacingValue(m[1], theme);
    return value === undefined ? null : build(value);
  }

  for (const [pattern, build] of SIZE_RULES) {
    const m = token.match(pattern);
    if (!m) continue;
    const dimension = parseDimension(m[1], theme);
    return dimension === undefined ? null : build(dimension);
  }

  let m: RegExpMatchArray | null;

  if ((m = token.match(/^rounded(?:-(.+))?$/))) {
    const key = m[1] ?? "default";
    if (key in theme.radii) return { borderRadius: theme.radii[key] };
    const value = spacingValue(key, theme) ?? Number(key);
    return Number.isNaN(value) ? null : { borderRadius: value };
  }

  // `shadow-lg` is elevation; `shadow-emerald-500/30` is the color of it.
  if ((m = token.match(/^shadow(?:-(.+))?$/))) {
    const key = m[1] ?? "default";
    if (key in theme.shadows) return { shadow: theme.shadows[key] };
    const color = parseColor(key, theme);
    return color === undefined ? null : { shadowColor: color };
  }

  // `-z-10`, not `z--10` — the leading minus is Tailwind's negation syntax.
  if ((m = token.match(/^z-(\d+)$/))) return { zIndex: Number(m[1]) };

  if ((m = token.match(/^aspect-(.+)$/))) {
    const key = m[1];
    if (key === "square") return { aspectRatio: 1 };
    if (key === "video") return { aspectRatio: 16 / 9 };
    const raw = arbitrary(key) ?? key;
    const ratio = raw.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (ratio) return { aspectRatio: Number(ratio[1]) / Number(ratio[2]) };
    const n = Number.parseFloat(raw);
    return Number.isNaN(n) ? null : { aspectRatio: n };
  }

  // `leading-tight` is a *multiple*; `leading-6` is points. They can't be folded
  // together here — the multiple needs a font size the resolver may never see.
  if ((m = token.match(/^leading-(.+)$/))) {
    const key = m[1];
    if (key in theme.leadings)
      return { lineHeightMultiple: theme.leadings[key] };
    const value = spacingValue(key, theme);
    return value === undefined ? null : { lineHeight: value };
  }

  if ((m = token.match(/^line-clamp-(\d+)$/)))
    return { maxLines: Number(m[1]) };

  // `border-2` is a width; `border-emerald-500` is a color.
  if ((m = token.match(/^border-(\d+)$/))) return { borderWidth: Number(m[1]) };

  if ((m = token.match(/^opacity-(\d+(?:\.\d+)?)$/)))
    return { opacity: Number(m[1]) / 100 };

  if ((m = token.match(/^bg-(.+)$/))) {
    const color = parseColor(m[1], theme);
    return color === undefined ? null : { backgroundColor: color };
  }

  if ((m = token.match(/^border-(.+)$/))) {
    const color = parseColor(m[1], theme);
    return color === undefined ? null : { borderColor: color };
  }

  // `text-` is overloaded: a size token, else a color token.
  if ((m = token.match(/^text-(.+)$/))) {
    const key = m[1];
    if (key in theme.fontSizes) return { fontSize: theme.fontSizes[key] };
    const size = arbitrary(key);
    if (size !== undefined && /^[\d.]/.test(size)) {
      return { fontSize: Number.parseFloat(size) };
    }
    const color = parseColor(key, theme);
    return color === undefined ? null : { color };
  }

  return null;
}

const GRADIENT_DIRECTIONS = new Set<string>([
  "to-t",
  "to-tr",
  "to-r",
  "to-br",
  "to-b",
  "to-bl",
  "to-l",
  "to-tl",
]);

/**
 * `bg-linear-to-br from-sky-500 via-indigo-400 to-violet-600` (v4), or the same
 * with v3's `bg-gradient-to-br`.
 *
 * A gradient is the one thing in Tailwind that a *single* token cannot express:
 * the direction and each stop arrive as separate classes and have to be gathered.
 * So it gets a pass of its own rather than being bent into the per-token table.
 *
 * `to-` is deliberately matched only here. Everywhere else in Tailwind a bare
 * `to-…` means nothing, so there is no ambiguity to resolve.
 */
function gradient(tokens: string[], theme: Theme): LinearGradient | undefined {
  let direction: GradientDirection | undefined;
  let from: string | undefined;
  let to: string | undefined;
  const via: string[] = [];

  for (const token of tokens) {
    const arrow = token.match(/^bg-(?:linear|gradient)-(to-[a-z]{1,2})$/);
    if (arrow && GRADIENT_DIRECTIONS.has(arrow[1])) {
      direction = arrow[1] as GradientDirection;
      continue;
    }
    const stop = token.match(/^(from|via|to)-(.+)$/);
    if (!stop) continue;
    const color = parseColor(stop[2], theme);
    if (color === undefined) continue;
    if (stop[1] === "from") from = color;
    else if (stop[1] === "to") to = color;
    else via.push(color);
  }

  // A direction with nothing to interpolate isn't a gradient, and two stops is
  // the minimum — a lone `from-` would paint a solid fill and silently swallow
  // whatever `bg-…` the author also wrote.
  if (direction === undefined || from === undefined || to === undefined)
    return undefined;
  return { direction, colors: [from, ...via, to] };
}

/**
 * Class strings are static literals re-serialized on every render, so the parse
 * is memoized per theme. Cached results are frozen: callers spread, never write.
 */
const cache = new WeakMap<Theme, Map<string, Readonly<ResolvedStyle>>>();

/**
 * Resolve a Tailwind-subset class string into a `ResolvedStyle`. Unknown tokens
 * are ignored; later tokens override earlier ones.
 */
export function resolveClassName(
  className: string,
  theme: Theme = defaultTheme,
): Readonly<ResolvedStyle> {
  let themeCache = cache.get(theme);
  if (!themeCache) {
    themeCache = new Map();
    cache.set(theme, themeCache);
  }
  const hit = themeCache.get(className);
  if (hit) return hit;

  const tokens = className.trim().split(/\s+/).filter(Boolean);

  const out: ResolvedStyle = {};
  const variants: StyleVariants = {};
  const base: string[] = [];

  for (const token of tokens) {
    const split = splitVariants(token);
    if (split === null) continue; // an unknown prefix — see `splitVariants`

    const [conditions, rest] = split;
    if (conditions.length === 0) {
      base.push(rest);
      const partial = matchToken(rest, theme);
      if (partial) Object.assign(out, partial);
      continue;
    }

    const partial = matchToken(rest, theme);
    if (!partial) continue;
    const key = conditions.join(":");
    variants[key] = { ...variants[key], ...partial };
  }

  // A gradient is spelled across several classes (`bg-gradient-to-br from-… to-…`),
  // so it reads the token list — and only the unconditional ones.
  const fill = gradient(base, theme);
  if (fill) out.backgroundGradient = fill;

  if (Object.keys(variants).length > 0) out.variants = variants;

  const frozen = Object.freeze(out);
  themeCache.set(className, frozen);
  return frozen;
}

/** The conditions a variant prefix may name. Anything else is not a variant. */
const VARIANTS: ReadonlySet<string> = new Set<VariantName>([
  "dark",
  "light",
  "hover",
  "focus",
  "active",
  "disabled",
]);

/**
 * `dark:hover:bg-zinc-800` → `[["dark", "hover"], "bg-zinc-800"]`.
 *
 * Returns `null` for a prefix that isn't a variant we can honour. Dropping the
 * whole token is deliberate: strip an unknown `md:` and it would silently become
 * an *unconditional* style, which is worse than it not working.
 */
function splitVariants(token: string): [string[], string] | null {
  // An arbitrary value may contain a colon (`bg-[url(a:b)]`), so only look for
  // prefixes ahead of the bracket.
  const bracket = token.indexOf("[");
  const head = bracket === -1 ? token : token.slice(0, bracket);
  const count = head.split(":").length - 1;
  if (count === 0) return [[], token];

  const conditions = token.split(":", count);
  const rest = token.slice(conditions.reduce((n, c) => n + c.length + 1, 0));
  return conditions.every((c) => VARIANTS.has(c)) ? [conditions, rest] : null;
}

/** The styling props every Uniview component accepts. */
export interface StyleProps {
  className?: string;
  style?: StyleInput;
}

/**
 * Expand the padding/margin shorthands in a style object into the four explicit
 * edges. Precedence, low → high: all-sides, then horizontal/vertical, then edge.
 */
export function normalizeStyleInput(style: StyleInput): ResolvedStyle {
  const {
    padding,
    paddingHorizontal,
    paddingVertical,
    margin,
    marginHorizontal,
    marginVertical,
    ...rest
  } = style;
  const out: ResolvedStyle = { ...rest };

  const edges = [
    ["paddingTop", out.paddingTop, paddingVertical, padding],
    ["paddingBottom", out.paddingBottom, paddingVertical, padding],
    ["paddingLeft", out.paddingLeft, paddingHorizontal, padding],
    ["paddingRight", out.paddingRight, paddingHorizontal, padding],
    ["marginTop", out.marginTop, marginVertical, margin],
    ["marginBottom", out.marginBottom, marginVertical, margin],
    ["marginLeft", out.marginLeft, marginHorizontal, margin],
    ["marginRight", out.marginRight, marginHorizontal, margin],
  ] as const;

  for (const [key, edge, axis, all] of edges) {
    const value = edge ?? axis ?? all;
    if (value !== undefined) {
      // Padding edges are plain numbers; margin edges may also be "auto".
      Object.assign(out, { [key]: value });
    }
  }

  return out;
}

/**
 * Resolve `className` + `style` into one `ResolvedStyle`. The style object wins
 * over the class string on any field they both set.
 */
export function resolveStyle(
  input: StyleProps,
  theme: Theme = defaultTheme,
): ResolvedStyle {
  const fromClass = input.className
    ? resolveClassName(input.className, theme)
    : {};
  const fromStyle = input.style ? normalizeStyleInput(input.style) : {};
  return { ...fromClass, ...fromStyle };
}

/**
 * Resolve a node's `className` + `style` into the Style IR object that travels on
 * the wire as `_style`, or `null` when the node has no styling.
 *
 * This is what every renderer's serializer emits so that a native host — which
 * has no CSS engine and never parses `className` — still gets the resolved
 * layout and visual style. It lives here, in `@uniview/style`, precisely so that
 * a *new* renderer (React, Solid, and whatever comes next) does not re-implement
 * it and drift: the whole point of the framework-agnostic contract is that the IR
 * is produced identically no matter which plugin-side framework authored the
 * tree. (The Solid renderer once forwarded `className` untouched, so Solid
 * plugins rendered natively lost every Tailwind-derived style — this exists so
 * that can't recur.)
 *
 * `undefined` fields are dropped so the object is JSON-clean; the result is a
 * plain `ResolvedStyle`, which is already JSON-safe, and callers hand it across
 * the boundary as-is.
 */
export function resolveStyleIR(
  props: { className?: unknown; style?: unknown },
  theme: Theme = defaultTheme,
): ResolvedStyle | null {
  const input: StyleProps = {};
  if (typeof props.className === "string") input.className = props.className;
  // A boundary cast: plugin props are untrusted, and `style` is contractually a
  // StyleInput. A field the IR can't express is dropped by the resolver.
  if (
    typeof props.style === "object" &&
    props.style !== null &&
    !Array.isArray(props.style)
  ) {
    input.style = props.style as StyleInput;
  }
  if (input.className === undefined && input.style === undefined) return null;

  const resolved: ResolvedStyle = {};
  for (const [key, value] of Object.entries(resolveStyle(input, theme))) {
    if (value !== undefined) Object.assign(resolved, { [key]: value });
  }
  return Object.keys(resolved).length > 0 ? resolved : null;
}
