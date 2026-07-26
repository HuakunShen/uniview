# 16. Semantic tokens resolved by the host, and why the renderer may not invent a color

## Why

`CLAUDE.md`'s prime directive has three words in it, and the third one is the one
this step is about: **"Brand-agnostic. The renderer must not contain a color, a
gradient, a corner radius or a shadow that it invented. It draws the Style IR,
and the Style IR comes from the plugin. Semantic tokens (`accent`, `foreground`,
`card`) resolve to the *system's* colors — the ones the user chose — never to
ours."** The failure mode it forbids is not hypothetical: `ButtonComponent`
accepted `variant: "primary"` and painted a hardcoded blue→violet brand gradient
that the plugin could not reach, in a renderer that was about to be ported to two
more platforms. Style therefore travels as an **intermediate representation** —
numbers and *names*, never resolved pixels — so that the two questions only the
host can answer (what does this system call `card`, and where is the pointer) are
answered by the host, per view, at draw time.

## Why this approach, and not the obvious alternative

**Alternative 1: send `className` and let each host parse it.** Then five hosts
need a Tailwind subset parser, and one of them is written in Swift with no JS
runtime at all. Worse, they would drift: the palette is not a matter of opinion
but of *bytes*, and Tailwind v4 re-tuned nearly every shade from v3. The real
palette file says what happens when a person types one from memory — "the first
draft of this file had 185 of 242 tokens wrong, and `bg-emerald-500` rendered a
different green natively than it did in a browser — from the same class name,
which is the one thing this project cannot get wrong"
([packages/style/src/palette.ts:1](../../packages/style/src/palette.ts#L1)). So the
parse happens once, plugin-side, and the resolver is a single package precisely
so a *new* renderer cannot re-implement it differently: "The Solid renderer once
forwarded `className` untouched, so Solid plugins rendered natively lost every
Tailwind-derived style — this exists so that can't recur."
([packages/style/src/resolve.ts:552](../../packages/style/src/resolve.ts#L552))

**Alternative 2: resolve everything to hex plugin-side, since we are parsing
anyway.** This is the tempting one, and it is what the step's negative example
shows failing. `Theme.nativeTokens` explains why it cannot be done:

> shadcn swaps a CSS variable and the cascade re-resolves; natively there is no
> cascade, so a hex resolved on the plugin side is a hex forever — it can't follow
> the system flipping to dark, and it can't be *different per window* the way
> `<Window appearance="light">` needs it to be.
> ([packages/style/src/theme.ts:16](../../packages/style/src/theme.ts#L16))

**Alternative 3: push the color scheme to the plugin and re-render.** That is
what `HostEnvironment` *could* have been used for, and the protocol explicitly
declines: "Note what is deliberately NOT solved here. `bg-card` does not consult
this: semantic color tokens travel to the host as names and are resolved
natively, per view, so they change with the appearance without a re-render or a
round trip."
([packages/protocol/src/environment.ts:1](../../packages/protocol/src/environment.ts#L1))
For `dark:` this would merely be slow and per-application rather than per-window.
For `hover:` it does not work at all — `main.ts` measures the local cost of a
hover transition at **0.0007 ms** and puts the round-trip alternatives beside it:
0.15 ms on the main thread, 0.6 ms across a Worker, 40 ms to another machine, and
each of those also re-runs a React tree and emits mutations. `CLAUDE.md` states
the rule directly: "a round trip per mouse-enter is wasteful locally and fatal
when the plugin runs on another machine."

## What changed since step 15

Steps 01–15 finished the machinery. The tree and its six mutations exist
(01–02), three authoring frameworks emit them (03–06), five hosts apply them
(07–11), three runtimes carry them (12–14), and step 15 established the seam that
matters here: events come *back* over RPC, and `HostEnvironment` is pushed
*forward* as state, so that hover and dark-mode never become a round trip.

This step adds the last thing that must **not** be baked into the renderer.
Concretely, the delta from step 15 is:

- A new derived prop, `_style`, carrying a `ResolvedStyle` alongside the
  untouched `className` the author wrote. Web hosts ignore it; native hosts read
  only it.
- A **two-stage** resolution where every previous step had one. Stage 1 runs in
  the plugin (class string → IR). Stage 2 runs in the host (IR + this view's
  state → pixels). What crosses the boundary between them is exactly the two
  things the plugin cannot know.
- Semantic color tokens that survive serialization **as names** (`"card"`,
  `"accent"`), where every other value in the tree so far has been fully
  resolved data.
- Variants (`dark:` / `hover:` / `focus:`) as keyed overlays that travel *with*
  the node. Step 15 argued that these must not round-trip; this step is the
  mechanism that means they never have to.

## How Uniview really does it

The single line that decides which colors stay symbolic — and the doc comment
that is the whole argument:

```typescript
  /**
   * Color tokens that stay **symbolic** in the Style IR instead of being frozen
   * to a hex: `bg-card` travels as `"card"`, and the native host maps it onto an
   * appearance-adaptive system color (`controlBackgroundColor`, `labelColor`, …).
   *
   * This is what "native" actually buys you. shadcn swaps a CSS variable and the
   * cascade re-resolves; natively there is no cascade, so a hex resolved on the
   * plugin side is a hex forever — it can't follow the system flipping to dark,
   * and it can't be *different per window* the way `<Window appearance="light">`
   * needs it to be. Keeping the name lets the OS answer the question, per view,
   * at draw time, with no re-render and no round trip.
   *
   * Their `colors` entry is still the value web hosts and TS-side resolution use,
   * so a theme with `nativeTokens: new Set()` resolves everything to hex — that's
   * the escape hatch for a fully custom, TS-owned palette.
   */
  nativeTokens: Set<string>;
```

[packages/style/src/theme.ts:11](../../packages/style/src/theme.ts#L11) (lines 11-27)

`parseColor` is where that becomes three lines of code — and the comment on
`bg-emerald-500` explains why palette colors deliberately do *not* get this
treatment:

```typescript
function parseColor(token: string, theme: Theme): string | undefined {
  const literal = arbitrary(token);
  if (literal !== undefined) return literal; // `bg-[#ff0000]`, `text-[rgb(…)]`

  const slash = token.lastIndexOf("/");
  const name = slash === -1 ? token : token.slice(0, slash);

  if (theme.nativeTokens.has(name)) return token;

  const base = theme.colors[name];
  if (base === undefined) return undefined;
```

[packages/style/src/resolve.ts:227](../../packages/style/src/resolve.ts#L227) (lines 227-236)

And the host end of the same contract, in Swift — variant selection, with the
Tailwind precedence rule spelled out as "least specific first":

```swift
    public func resolved(for state: Set<String>) -> StyleIR {
        guard let variants, !variants.isEmpty else { return self }

        let matching = variants
            .filter { key, _ in key.split(separator: ":").allSatisfy { state.contains(String($0)) } }
            .sorted { $0.key.split(separator: ":").count < $1.key.split(separator: ":").count }

        var result = self
        for (_, overlay) in matching { result = result.overlaid(with: overlay) }
        return result
    }
```

[packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift:275](../../packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift#L275)

The `state` it is given is assembled per view, from the view's *own* appearance
and its *own* pointer and first-responder status —
[packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift:32](../../packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift#L32)
(lines 32-43) — and the names are answered by a table of dynamic `NSColor`s:
`foreground` → `.labelColor`, `card` → `.controlBackgroundColor`, `border` →
`.separatorColor`, `accent` → `.controlAccentColor`
([packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift:420](../../packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift#L420)).

## What this step leaves out

The real `@uniview/style` covers far more of the Tailwind-ish surface, and the
real host does more with the result.

- **Most of the class vocabulary.** This step implements `p-`, `gap-`, `rounded-`,
  `bg-`, `border-`, `text-` and four font weights. The real resolver has a
  50-entry static table (flex direction, wrap, `items-*` / `justify-*` /
  `self-*`, `relative`/`absolute`, `hidden`, overflow, italics, decorations,
  `truncate`, text alignment), 22 edge rules for padding/margin/inset, six sizing
  rules, plus `aspect-`, `leading-`, `line-clamp-`, `opacity-`, `z-` and
  `shadow-`.
  [packages/style/src/resolve.ts:29](../../packages/style/src/resolve.ts#L29)
- **Arbitrary values everywhere, and negation.** `p-[13px]`, `w-[50%]`,
  `bg-[rgb(…)]` are matched loosely so an arbitrary value works anywhere a scale
  step does, with `_` spelling a space; `-mt-2` / `-inset-1` negate, but only
  against an allowlist, because a negative border radius is nonsense.
  [packages/style/src/resolve.ts:165](../../packages/style/src/resolve.ts#L165),
  [packages/style/src/resolve.ts:135](../../packages/style/src/resolve.ts#L135)
- **Alpha suffixes.** `bg-card/50` keeps its whole token including the slash so
  the host can apply the alpha to a *dynamic* color; a literal instead folds the
  alpha into an 8-digit `#rrggbbaa`, "the form native color parsers already take,
  so no host needs an `rgba()` parser".
  [packages/style/src/resolve.ts:218](../../packages/style/src/resolve.ts#L218)
- **Gradients.** The one thing a single token cannot express — direction and
  stops arrive as separate classes (`bg-linear-to-br from-… via-… to-…`) and are
  gathered in a pass of their own, over the unconditional tokens only. This is
  the feature that *replaced* the hardcoded `ButtonComponent` gradient, so it is
  the most on-topic omission here.
  [packages/style/src/resolve.ts:376](../../packages/style/src/resolve.ts#L376),
  [packages/style/src/types.ts:61](../../packages/style/src/types.ts#L61)
- **Shadows as geometry.** `shadow-lg` resolves to `{offsetX, offsetY, radius,
  color}` from the theme scale, and `shadow-emerald-500/30` overrides just the
  color, so the two compose. "A host that hardcodes the radius and offset (as
  this one did) can render exactly one shadow, forever."
  [packages/style/src/types.ts:36](../../packages/style/src/types.ts#L36),
  [packages/style/src/theme.ts:99](../../packages/style/src/theme.ts#L99)
- **Two more variants, and the memoization.** The real `VariantName` set is six:
  `dark`, `light`, `hover`, `focus`, `active`, `disabled`. Results are frozen and
  memoized in a `WeakMap` keyed by theme, because class strings are static
  literals re-serialized on every render.
  [packages/style/src/types.ts:81](../../packages/style/src/types.ts#L81),
  [packages/style/src/resolve.ts:409](../../packages/style/src/resolve.ts#L409)
- **`style={{…}}` merging and shorthand expansion.** `normalizeStyleInput`
  expands `padding` / `paddingHorizontal` / `marginVertical` into the four
  explicit edges with a defined precedence, and the style object wins over the
  class string field by field. `resolveStyleIR` is what the renderers actually
  call, and it drops `undefined` fields so the result is JSON-clean.
  [packages/style/src/resolve.ts:503](../../packages/style/src/resolve.ts#L503),
  [packages/style/src/resolve.ts:570](../../packages/style/src/resolve.ts#L570)
- **Everything the host does after picking a style.** `lineHeightMultiple` is
  multiplied by the *final* font size on the host, because the resolver may never
  see it; a view only installs pointer tracking when the IR actually contains a
  `hover:` key; and `focus:` repaints have to be deferred a turn because the
  window has not moved first responder yet when `becomeFirstResponder` runs.
  [packages/style/src/types.ts:171](../../packages/style/src/types.ts#L171),
  [packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift:80](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift#L80),
  [packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift:131](../../packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift#L131)
- **The real system palette.** This step's `macOS` host returns approximate sRGB
  bytes for `labelColor` and friends so the columns are printable. The real ones
  are dynamic `NSColor`s built with a provider closure and resolved inside
  `performAsCurrentDrawingAppearance` — the value is never a string at all.
  [packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift:399](../../packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift#L399)

## Trade-offs

- **The plugin owns the parser, so hosts cannot drift — but they also cannot
  extend.** A host that wants `backdrop-blur` cannot invent it; the class would
  be silently dropped plugin-side and never reach the IR. Adding vocabulary means
  adding a field to `ResolvedStyle` and teaching every native host to draw it.
  What it buys is that `bg-emerald-500` is the same green in five hosts.
- **Semantic tokens travel unresolved, so the IR is not self-describing.** A host
  that does not recognize `"card"` has to fall back to something, and the tree
  alone cannot tell it what. The payoff is the only way to get a color that
  follows the appearance *per window*, with no re-render.
- **Variants ship even when they never fire.** The example's IR is 664 bytes for
  one `<div>`, and four of its overlays describe states that view may never
  enter. That is the cost of never asking: `hover:` resolves in 0.0007 ms
  locally instead of 40 ms over a socket, and `focus:` works while the plugin's
  machine is asleep.
- **Two resolution stages means two places a style can go missing.** A token can
  be dropped by the plugin-side parser (unknown class, unknown variant prefix) or
  by the host-side name table (unknown semantic token). The debugging story is
  worse than CSS's; the portability story is the entire product.
- **Palette colors freeze, and that is a decision, not an oversight.**
  `bg-zinc-800` is the same grey in dark mode, which is occasionally not what an
  author wanted — but it *is* what it means in Tailwind, and the alternative
  (making every color adaptive) would leave a plugin author no way to say "this
  exact color, everywhere".

## Run it

```
pnpm tsx steps/16-style-ir/main.ts
```

Real output, **trimmed**. Elided: section 1's class-token listing, the prose
commentary after each table, section 4's hover table, and the `CLAUDE.md`
`ButtonComponent` quotation printed at the end. Every line below is verbatim,
including the trailing padding in the tables.

```
=== 2. What travels — the Style IR, resolved once, in the plugin ===

{
  "paddingTop": 16,
  "paddingRight": 16,
  "paddingBottom": 16,
  "paddingLeft": 16,
  "gap": 8,
  "borderRadius": 8,
  "borderWidth": 1,
  "fontWeight": "medium",
  "backgroundColor": "card",
  "color": "foreground",
  "borderColor": "border",
  "variants": {
    "hover": {
      "backgroundColor": "muted"
    },
    "focus": {
      "borderColor": "accent"
    },
    "dark": {
      "borderColor": "#3f3f46"
    },
    "dark:hover": {
      "backgroundColor": "#27272a"
    }
  }
}

  664 bytes, sent once.
```

Then the same bytes, four host views — nothing above was re-sent, re-rendered or
re-parsed:

```
=== 3. The SAME IR, resolved by four different host views ===

  field           macOS light             macOS dark              macOS dark, pink accent Terminal dark           
  ----------------------------------------------------------------------------------------------------------------
  backgroundColor #ffffff                 #1e1e1e                 #1e1e1e                 ansi:default-bg         
  color           #000000d9               #ffffffd9               #ffffffd9               ansi:white              
  borderColor     #0000001a               #3f3f46                 #3f3f46                 #3f3f46                 
  borderWidth     1                       1                       1                       1                       
  borderRadius    8                       8                       8                       8                       
  paddingTop      16                      16                      16                      16                      
  gap             8                       8                       8                       8                       
  fontWeight      medium                  medium                  medium                  medium                  
```

The hover accounting, and why a variant may not be an RPC call:

```
  measured: 200,000 variant resolutions in 130.1 ms (200,000 hits)
            = 0.651 us per hover transition, locally.

  the alternative — ask the plugin instead (step 15's round trip):

    runtime                                     per enter    per hour
    -----------------------------------------------------------------
    host-resolved (measured)                    0.0007 ms     0.005 s
    round trip: main thread (step 12)           0.1500 ms     1.080 s
    round trip: Web Worker (step 13)            0.6000 ms     4.320 s
    round trip: WebSocket, LAN (step 14)        1.5000 ms    10.800 s
    round trip: WebSocket, another machine     40.0000 ms   288.000 s
```

And the negative example — the same four views, and a color that ignores all of
them:

```
=== 5. The negative example: a color that cannot adapt ===

  <div className="p-4 rounded-lg border bg-[#3b82f6] text-white border-[#3b82f6]">

  field           macOS light             macOS dark              macOS dark, pink accent Terminal dark           
  ----------------------------------------------------------------------------------------------------------------
  backgroundColor #3b82f6                 #3b82f6                 #3b82f6                 #3b82f6                 
  color           #ffffff                 #ffffff                 #ffffff                 #ffffff                 
  borderColor     #3b82f6                 #3b82f6                 #3b82f6                 #3b82f6                 
```

The per-enter numbers vary a little between runs (the measured row is a real
`performance.now()` timing of 200,000 resolutions; the round-trip budgets are
stated assumptions, not measurements). Everything else is deterministic.

## Sources

- [packages/style/src/resolve.ts](../../packages/style/src/resolve.ts) —
  `parseColor`, `matchToken`, `splitVariants`, `VARIANTS`, `resolveClassName`,
  `gradient`, `normalizeStyleInput`, `resolveStyle`, `resolveStyleIR`
- [packages/style/src/types.ts](../../packages/style/src/types.ts) —
  `ResolvedStyle`, `StyleVariants`, `VariantName`, `BoxShadow`, `LinearGradient`,
  `StyleInput`
- [packages/style/src/theme.ts](../../packages/style/src/theme.ts) — `Theme`,
  `nativeTokens`, `SEMANTIC_COLORS`, `defaultTheme` / `lightTheme` / `darkTheme`
- [packages/style/src/palette.ts](../../packages/style/src/palette.ts) — the
  generated Tailwind palette, and why it is generated
- [packages/protocol/src/environment.ts](../../packages/protocol/src/environment.ts) —
  `HostEnvironment`, and what it is deliberately *not* for
- [packages/react-renderer/src/serialization/serialize-props.ts](../../packages/react-renderer/src/serialization/serialize-props.ts) —
  where `_style` is derived and attached (line 32 for the prop name)
- [packages/solid-renderer/src/serialization/serialize-props.ts](../../packages/solid-renderer/src/serialization/serialize-props.ts) —
  the identical job in the Solid renderer, calling the same resolver
- [packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift](../../packages/UniviewAppKit/Sources/UniviewNativeCore/StyleIR.swift) —
  the host-side `StyleIR`, `resolved(for:)` and `overlaid(with:)`
- [packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Support.swift) —
  `StyleStateView.styleState`, and `CSSColor.named` mapping tokens onto dynamic
  `NSColor`s
- [packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/Primitives.swift) —
  `ButtonComponent` and the doc comment recording the gradient that was removed
- [packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift](../../packages/UniviewAppKit/Sources/UniviewAppKit/HostEnvironment.swift) —
  reading the environment *as a specific view sees it*
- [CLAUDE.md](../../CLAUDE.md) — "THE PRIME DIRECTIVE", the brand-agnostic
  paragraph, the `ButtonComponent` story, and "High-frequency interaction is
  local, never RPC"
- [learn/steps/01-protocol/main.ts](../steps/01-protocol/main.ts) — the `UINode`
  / `JSONValue` vocabulary this step carries forward
