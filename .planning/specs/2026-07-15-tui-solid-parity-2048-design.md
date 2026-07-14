# Design — `@uniview/tui-solid` full parity → 2048-in-Solid

**Date:** 2026-07-15 · **Branch:** `feat/tui` · **Status:** approved
**Follows:** `.planning/specs/2026-07-14-tui-layout-charts-design.md` (Phases 1–2 complete)

## Goal

Bring `@uniview/tui-solid` to full component parity with `@uniview/tui-react`
(primitives, Panel/List/StatusBar/focus, charts, content, interactive), then build
a **2048 game in Solid** driven by the real trained **n-tuple + expectimax AI**.

Two sequential arcs, each its own plan, each executed subagent-driven with TDD +
per-task review + whole-branch review (same rigor as Phases 1–2).

---

## Arc A — Solid component parity

### Key insight

Most of the work is *not* a rewrite. Prop **interpretation** already lives host-side in
`packages/host-tui/src/convert.ts`, which both roots feed identically — so Solid's
`box`/`text`/`richtext` already support `border`/`title`/`backgroundColor`/`onClick`/
`onKeyDown`/every `TuiStyle` field **at runtime today**. `createTuiSolidRoot` already
renders Solid reactively to a terminal. What's missing is the **component layer**, plus
two real gaps below.

### Gap 1 (blocker) — tsdown cannot compile Solid `.tsx`

`packages/tui-solid/tsdown.config.ts` is bare `defineConfig({ exports: true })`. Solid
needs `babel-preset-solid` with `{ moduleName: "@uniview/solid-renderer", generate:
"universal" }` — its JSX compiles to universal-renderer calls, **not** `React.createElement`.
Today only **vitest** can compile Solid JSX (via the `solidUniversal()` babel plugin in
`packages/tui-solid/vitest.config.ts`); the **build cannot**. `src/index.ts` is plain `.ts`,
so this has never mattered — it blocks the moment we author a `.tsx` component.

**Decision:** add the same babel transform to the tsdown build (mirror `vitest.config.ts`'s
plugin). This unlocks idiomatic Solid `.tsx` source. It is Task 1 — nothing else can land first.

> Rejected alternative: author Solid components in `.ts` with manual universal-renderer
> calls (as tui-react does with `createElement`). Solid's universal runtime is imperative
> (`createElement(tag)` + `insert`/`spread`), which is clumsy for recursive trees and
> unidiomatic. Fixing the build once is strictly better.

### Gap 2 — Solid JSX intrinsics are effectively untyped

`packages/solid-renderer/jsx-runtime.d.ts` types `IntrinsicElements` with a catch-all
`[tag: string]: Record<string, unknown>`. So `<box border="rounded">` type-checks — and so
does `<box boarder={42}>`. Zero safety.

**Decision:** mirror tui-react's convention — export **capitalized typed wrappers**
(`Box`/`Text`/`RichText`) with real prop types, rather than extending the JSX namespace.
Nobody in tui-react writes lowercase `<box>`; Solid authors get the same typed surface.

### Gap 3 — prop-shape types live only in tui-react

`TuiKeyEvent`/`TuiWheelEvent`/`TuiPointerEvent`/`TuiEventHandlers`/`TuiSemanticProps` and
the pure helpers `nextFocus`/`listCounter`/`clampScroll`/`filterCommands` are all
framework-agnostic but currently sit in `packages/tui-react/src/`. tui-solid must not
depend on tui-react (that would drag in React).

**Decision:** extract them into `@uniview/tui-core`; `tui-react` re-exports them (no public
API break, its tests prove it); `tui-solid` imports them. This is the second consumer —
exactly when extraction is justified — and it prevents React/Solid drift. Each package
still composes its **own** `TuiCommonProps` (React adds `children?: ReactNode`/`key?: Key`;
Solid adds `children?: JSX.Element`).

### Reuse (verbatim, no rewrite)

- `@uniview/tui-charts` — all six builders, zero framework deps, return plain `RenderNode`.
- `@uniview/tui-content` — `renderMarkdown`/`renderCode`/`renderDiff`/`detectLanguage`/
  `splitStableMarkdown`.
- `@uniview/tui-core` — `TuiStyle`/`CellStyle`/`Color`/`StyledSpan`/`RenderNode`/
  `computeVirtualWindow`, plus the newly-extracted types + pure helpers.
- The **mapping logic** of `renderNodeToElement` (which `RenderNode` field → which primitive
  prop) is fully framework-agnostic; only the element-construction call differs.

### The one piece of real logic to port carefully — `List`

tui-react's `List` uses a `requestedRef` (`useRef`) + two `useEffect`s so that **consecutive
synchronous key events compose** against a `selectedIndex` prop that lags one render behind
(two fast `ArrowDown`s must move two rows, not one). **This is not a React artifact** — Solid's
`createEffect` is likewise async relative to a synchronous input handler, and `selectedIndex`
is still a parent-controlled prop. The Solid port therefore **keeps the same "last requested
wins" pattern**, using a plain mutable variable (no signal needed — it's written then read
synchronously, never read reactively) resynced in a `createEffect`. Everything else maps
mechanically: `useState` → `createSignal`, `useMemo` → `createMemo` (no dep arrays — Solid
tracks reads), `React.memo` → unnecessary (Solid component bodies run once).

### Arc A deliverables

`@uniview/tui-solid` gains: `Box`/`Text`/`RichText`, `renderNodeToElement` (a recursive
`NodeView` using `<For>`), `Panel`, `StatusBar`, `List` + `listCounter`, `nextFocus` +
`createFocusList`, the six chart components, `Markdown`/`Code`/`Diff`, `ScrollView`/
`Hoverable`/`CommandPalette`, `Select`, `VirtualList` — plus a **lazygit-style Solid demo**
proving the surface end-to-end (headless-tested + smoke-tested, like the React demos).

---

## Arc B — 2048-in-Solid

### Port source: **`ufo`, not the local repo**

The local `~/Dev/2048AI/web` is **stale**. The trained weights on
`ufo:/home/hk/dev/2048AI/web/static/model/` are in a newer **universal variable-grid**
format that the local code *cannot load*:

| | local (stale) | **ufo (current — use this)** |
|---|---|---|
| engine | standalone `move()`/`spawn()` | **`class Engine(H, W)`** — variable grid, `MAX_EXPONENT=17` |
| value fn | `ntuple.ts`: `allocLuts`/`scatterInto`/`makeValue` | **`universal.ts`: `class UniversalValue`**, `.value(board,H,W)` |
| loader | `manifest.counts[t]` + flat `lut{t}.bin` | **`model.ts`: `buildValue(manifest, buffers)`**, sharded `lut{k}_{p}.bin` |
| manifest | `{counts}` | `{alphabet, patterns[], tableSizes[], parts[][], shapes[]}` |

Port **verbatim** from ufo (~573 lines, all pure, zero DOM):
`engine/board.ts` (247) · `ai/patterns.ts` (98) · `ai/universal.ts` (77) ·
`ai/expectimax.ts` (107) · `ai/model.ts` (44).

Key signatures:
- `class Engine(H, W)` → `empty()`, `move(board, dir): MoveResult`, `spawn`, `initBoard`,
  `isDone`; `type Board = Uint8Array` (H·W exponents); `type Dir = 'UP'|'DOWN'|'LEFT'|'RIGHT'`.
- `class UniversalValue(patterns, luts)` → `value(board, H, W): number`.
- `buildValue(manifest: Manifest, buffers: ArrayBuffer[][]): UniversalValue`.
- `class Expectimax(engine, value: ShapeValueFn)` → `getMove(board, cfg: DepthCfg): { dir, value }`.

Reimplement (drop the shell): the Svelte `game.svelte.ts` controller → a plain class
(`move → commit → spawn → win/game-over`), no runes, no `document.baseURI`, no sprites/animation.
Replace `client.ts`/`ai.worker.ts` (Web Worker + kkrpc + `fetch`) with a Node `fs` loader
mirroring ufo's `ai/play.test.ts`:

```ts
const manifest = JSON.parse(readFileSync(dir + "manifest.json", "utf8")) as Manifest;
const buffers = manifest.patterns.map((_, k) =>
  manifest.parts[k].map((_p, p) => {
    const raw = readFileSync(dir + `lut${k}_${p}.bin`);
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  }),
);
const value = buildValue(manifest, buffers);
const ai = new Expectimax(eng, (b) => value.value(b, eng.H, eng.W));
```

### Model weights — 85 MB, never committed

`manifest.json` (578 B) + 10 sharded LUTs (`lut0_0`…`lut4_2.bin`), **85 MB total**.

**Decision:** weights are **not** added to git. The example resolves the model dir from
`UNIVIEW_2048_MODEL_DIR`, defaulting to a **gitignored** `examples/tui-2048-solid/model/`,
with a documented one-line `scp` fetch from ufo in the README.

**The AI is optional.** If the model dir is absent, the game still runs (human play) and the
AI toggle is disabled with a clear on-screen message. This keeps the example runnable for
anyone without the weights, and keeps the repo small.

### 2048 rendering — no new primitive

A 2048 board is a grid of colored `Box` tiles with centered `Text` — the same class as the
roadmapped crossword. Uses only what Arc A ships:
`Panel`-framed 4×4 grid (2048 tile palette from the web app) · `StatusBar` keybindings ·
arrow-key play · an **AI auto-play toggle** stepping the expectimax on a timer · a live score
**`Sparkline`** (showcasing the Solid charts).

### Testing

Port ufo's golden fixtures to pin the engine bit-for-bit; unit-test the controller
(merge/spawn/game-over); headless-test the Solid TUI against `MemoryCellSurface`; smoke-test
the real boot (`UNIVIEW_DEMO_ONCE=1`). AI tests are **skipped when the model is absent** so
CI stays green without the 85 MB asset.

---

## Constraints (both arcs)

- TDD (RED→GREEN→commit); per-task review; whole-branch review per arc.
- `pnpm check-types` **must be clean per package before every commit** (vitest + tsdown do
  not type-check — this bit us in Phase 1).
- No `as any` / `@ts-ignore` / `@ts-expect-error`. Strict TS, `verbatimModuleSyntax`.
- 2-space indent. Component source in tui-solid is `.tsx` (after Task 1); tests are `.tsx`.
- No protocol change; no new `RenderNode` type.
