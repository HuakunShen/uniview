# Arc A — `@uniview/tui-solid` full parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Task-by-task, TDD.

**Goal:** Bring `@uniview/tui-solid` to full component parity with `@uniview/tui-react`.
**Spec:** `.planning/specs/2026-07-15-tui-solid-parity-2048-design.md`

## Global Constraints

- Tests per package: `cd packages/tui-solid && pnpm vitest run`.
- **`pnpm check-types` MUST be clean before every commit** (vitest + tsdown do not type-check).
- After editing a lib's `src`, `pnpm --filter @uniview/<pkg> build` (downstream reads `dist`).
- No `as any` / `@ts-ignore` / `@ts-expect-error`. Strict TS, `verbatimModuleSyntax`. 2-space indent.
- Solid component source is `.tsx` (unlocked by Task 1). Tests are `.tsx`.
- Solid idiom: `useState`→`createSignal`, `useMemo`→`createMemo` (no dep arrays), `React.memo`→drop.
- Commit per task: `feat(tui-solid): …`.

## Reference (read before starting)

- Port source: `packages/tui-react/src/{primitives,content,panel,status-bar,focus,list,charts,interactive,select,virtual-list}.ts`.
- Existing Solid root: `packages/tui-solid/src/index.ts` (`createTuiSolidRoot` — already works).
- Solid JSX-for-tests babel plugin: `packages/tui-solid/vitest.config.ts` (`solidUniversal()`).
- Prop interpretation (shared by both roots, do NOT change): `packages/host-tui/src/convert.ts`.

---

## Task 1 — tsdown must compile Solid `.tsx` (BLOCKER — nothing else lands first)

**Files:** `packages/tui-solid/tsdown.config.ts`; probe `packages/tui-solid/src/probe.tsx` (deleted at the end); `packages/tui-solid/package.json` (babel devDeps already present).

**Problem:** `tsdown.config.ts` is bare `defineConfig({ exports: true })`. Solid JSX must be compiled by `babel-preset-solid` with `{ moduleName: "@uniview/solid-renderer", generate: "universal" }` — esbuild's default JSX transform emits `React.createElement`-shaped calls and is WRONG for Solid. Today only vitest can compile Solid JSX.

- [ ] **Step 1:** Read `packages/tui-solid/vitest.config.ts` — it already has a working `solidUniversal()` Vite plugin doing exactly this transform (`@babel/core` + `babel-preset-solid` + `@babel/preset-typescript`, `enforce: "pre"`, only `.tsx`). Mirror it as a rolldown/tsdown input plugin in `tsdown.config.ts` (tsdown accepts `plugins: [...]`).
- [ ] **Step 2 (RED):** Create a throwaway `src/probe.tsx` exporting a trivial Solid component (e.g. `export function Probe() { return <box><text>hi</text></box>; }`), re-export it from `src/index.ts`, and run `pnpm --filter @uniview/tui-solid build`. It MUST fail (or emit React-shaped calls) before the plugin is wired.
- [ ] **Step 3 (GREEN):** Wire the plugin; rebuild. Verify `dist/index.mjs` contains universal-renderer calls (imports from `@uniview/solid-renderer`, e.g. `createElement`/`insert`), NOT `React.createElement`. Also `pnpm check-types` clean.
- [ ] **Step 4:** Delete `src/probe.tsx` + its export; rebuild to confirm still green.
- [ ] **Step 5:** Commit `build(tui-solid): compile Solid JSX in tsdown via babel-preset-solid`.

> If tsdown cannot take a babel plugin cleanly, STOP and report — do not silently fall back to `.ts` + manual `createElement`; that decision is the controller's.

---

## Task 2 — Extract framework-agnostic types + pure helpers into `@uniview/tui-core`

**Files:** create `packages/tui-core/src/ui/events.ts` (+ export from `packages/tui-core/src/index.ts`); modify `packages/tui-react/src/{primitives,focus,list,interactive}.ts` to re-export from tui-core; tests: `packages/tui-core/tests/ui/events.test.ts`.

**Move to tui-core (verbatim, no behavior change):**
- Types: `TuiKeyEvent`, `TuiWheelEvent`, `TuiPointerEvent`, `TuiEventHandlers`, `TuiSemanticProps` (from `tui-react/src/primitives.ts`).
- Pure fns: `nextFocus` (focus.ts), `listCounter` (list.ts), `clampScroll` + `filterCommands` (interactive.ts).

**Rules:** `tui-react` keeps its public API IDENTICAL — it re-exports these from tui-core (its existing tests are the proof; they must stay green). `TuiCommonProps` itself does NOT move (it carries React's `children?: ReactNode`/`key?: Key`); each framework composes its own.

- [ ] RED: move `nextFocus`'s existing tests to tui-core (import from `../../src/index`) — fails (not exported).
- [ ] GREEN: create `src/ui/events.ts`, export from tui-core index, build tui-core.
- [ ] Re-point tui-react's modules to re-export from `@uniview/tui-core`; run the FULL tui-react suite (must be green, unchanged) + `pnpm check-types` in BOTH packages.
- [ ] Build tui-core + tui-react. Commit `refactor(tui-core): host framework-agnostic event types + pure UI helpers`.

---

## Task 3 — Solid primitives: `Box` / `Text` / `RichText` + `TuiCommonProps`

**Files:** `packages/tui-solid/src/primitives.tsx`, `packages/tui-solid/tests/primitives.test.tsx`, export from `src/index.ts`.

Mirror `packages/tui-react/src/primitives.ts`, but Solid-flavored:
- `TuiCommonProps extends TuiStyle, TuiEventHandlers, TuiSemanticProps { children?: JSX.Element; backgroundColor?: Color }` (import the handler/semantic types from `@uniview/tui-core` — Task 2).
- `BoxProps = TuiCommonProps`; `TextProps extends TuiCommonProps { color?; bold?; dim?; italic?; underline?; strikethrough?; inverse? }`; `RichTextProps extends TuiCommonProps { spans?: StyledSpan[] }`.
- `Box`/`Text`/`RichText` — **capitalized typed wrappers** returning `<box {...props} />` etc. (Solid's lowercase intrinsics are typed only by a catch-all `Record<string, unknown>` → zero safety; capitalized wrappers are how tui-react does it too).
- IMPORTANT (Solid): do NOT destructure props (breaks reactivity) — spread them (`<box {...props} />`) or use `splitProps`.

Tests: mount via `createTuiSolidRoot` + `MemoryCellSurface` (see `packages/tui-solid/tests/tui-solid.test.tsx` for the harness) — a `Box` with `backgroundColor`/`width`/`height` fills; a `Text` with `color`/`bold` renders styled.

- [ ] RED → GREEN → check-types → build → commit `feat(tui-solid): typed Box/Text/RichText primitives`.

---

## Task 4 — `renderNodeToElement` for Solid (the foundation for charts + content)

**Files:** `packages/tui-solid/src/content.tsx` (start with just this fn), `packages/tui-solid/tests/render-node.test.tsx`.

Mirror `packages/tui-react/src/content.ts`'s `toElement` recursion EXACTLY (same field→prop mapping), as a recursive Solid component:

```tsx
import { For } from "solid-js";
import type { RenderNode, CellStyle } from "@uniview/tui-core";

function NodeView(props: { node: RenderNode }): JSX.Element {
  const n = props.node;
  if (n.type === "richtext") {
    return <richtext spans={n.spans ?? []} backgroundColor={n.background} {...(n.style ?? {})} />;
  }
  if (n.text !== undefined && (n.children?.length ?? 0) === 0) {
    const ts: CellStyle = n.textStyle ?? {};
    return (
      <text color={ts.fg} backgroundColor={n.background} bold={ts.bold} dim={ts.dim}
            italic={ts.italic} underline={ts.underline} strikethrough={ts.strikethrough}
            inverse={ts.inverse} {...(n.style ?? {})}>{n.text}</text>
    );
  }
  return (
    <box backgroundColor={n.background} {...(n.style ?? {})}>
      <For each={n.children ?? []}>{(child) => <NodeView node={child} />}</For>
    </box>
  );
}

export function renderNodeToElement(node: RenderNode): JSX.Element {
  return <NodeView node={node} />;
}
```

Dispatch order matters: **richtext → text-leaf → box** (same as React). `textStyle.fg` maps to the `color` prop (rename); `backgroundColor` comes from `node.background` (NOT `textStyle.bg`).

Tests: feed a hand-built `RenderNode` (a box containing a text leaf and a richtext with spans) and assert the rendered surface text + a span color. Cross-check against tui-react's output for the same node if convenient.

- [ ] RED → GREEN → check-types → build → commit `feat(tui-solid): renderNodeToElement (RenderNode → Solid tree)`.

---

## Task 5 — `Panel` + `StatusBar`

**Files:** `packages/tui-solid/src/{panel,status-bar}.tsx`, tests, index exports.

Direct ports of `packages/tui-react/src/{panel,status-bar}.ts` — **no state, no hooks**:
- `Panel`: `borderColor = focused ? (focusedColor ?? "green") : borderColor`; `border` defaults `"rounded"`; passes `title/titleAlign/footer/footerAlign`. Use `splitProps` instead of destructuring.
- `StatusBar`: joins `items.map(i => \`${i.label}: ${i.keyHint}\`)` with `separator` (default `" | "`), renders a row `box` + `text`.

Tests mirror `packages/tui-react/tests/{panel,status-bar}.test.tsx` (titled border + right-aligned footer; focused border is green; `"Checkout: <space> | Delete: d"`).

- [ ] RED → GREEN → check-types → build → commit `feat(tui-solid): Panel + StatusBar`.

---

## Task 6 — focus + `List` (the one with real logic)

**Files:** `packages/tui-solid/src/{focus,list}.tsx`, tests, index exports.

- `nextFocus` + `listCounter`: **re-export from `@uniview/tui-core`** (Task 2) — do not reimplement.
- `createFocusList(count, initial=0)` → `{ focused: Accessor<number>, setFocused, handleKey(e: TuiKeyEvent): boolean }` via `createSignal` (Solid analogue of `useFocusList`).
- `List<T>`: port `packages/tui-react/src/list.ts`. **CRITICAL — keep the "last requested wins" pattern.** `selectedIndex` is a parent-controlled prop that lags one render behind, so two synchronous `ArrowDown`s would otherwise collapse into one step. This is NOT a React artifact — Solid's `createEffect` is also async relative to a synchronous key handler. Port as:
  - `let requested = props.selectedIndex;` — a plain mutable variable (NOT a signal: written then read synchronously, never read reactively).
  - `createEffect(() => { requested = props.selectedIndex; })` — resync on external changes.
  - `onKeyDown`: read `requested` (not the prop) as `current`, compute `next` (ArrowDown/Up/Home/End/PageDown/PageUp, clamped to `[0, items.length-1]`), set `requested = next` **before** calling `props.onSelect(next)`.
  - Row `onClick`: same — `requested = index; props.onSelect(index);`.
  - `scrollTop`: `createSignal(0)` + a `createEffect` keeping the selection in view (`sel < top → top = sel`; `sel >= top+viewport → top = sel-viewport+1`; else clamp to `maxScroll`).
  - Full-row highlight: row `box` `width="100%"` + `backgroundColor` (default `"blue"`).

Tests mirror `packages/tui-react/tests/list.test.tsx`. **NOTE the routing gotcha:** keys only reach a *focused* node that has `onKeyDown` — the tests MUST `dispatchInput(key("Tab"))` first. Include the **two-fast-ArrowDowns-move-two-rows** test (that is what the `requested` pattern exists for).

- [ ] RED → GREEN → check-types → build → commit `feat(tui-solid): List + focus`.

---

## Task 7 — Chart components (6)

**Files:** `packages/tui-solid/src/charts.tsx`, tests, index exports; add `"@uniview/tui-charts": "workspace:*"` to `packages/tui-solid/package.json` + `pnpm install`.

Six thin wrappers over the pure builders (identical Props shapes to `packages/tui-react/src/charts.ts`):

```tsx
export function BarChart(props: BarChartProps): JSX.Element {
  const node = createMemo(() => renderBarChart(props.data, props.options));
  return <NodeView node={node()} />;   // or renderNodeToElement(node())
}
```
…same for `Histogram(values)`, `Sparkline(values)`, `Gauge(fraction)`, `LineChart(series)`, `Scatter(series)`. `createMemo` replaces `useMemo` (no dep array — Solid tracks reads automatically). Import builders + `BarDatum`/`BarChartOptions`/`HistogramOptions`/`SparklineOptions`/`GaugeOptions`/`LineSeries`/`PlotOptions` from `@uniview/tui-charts`.

Tests mirror `packages/tui-react/tests/charts.test.tsx`: `Sparkline values={[0,4,8]} options={{max:8}}` → screen has `"▄█"`; `Gauge fraction={1} options={{width:4}}` → `"████"`; `BarChart` → a `"█"`; plus one more.

- [ ] RED → GREEN → check-types → build → commit `feat(tui-solid): chart components`.

---

## Task 8 — Content components (`Markdown` / `Code` / `Diff`)

**Files:** extend `packages/tui-solid/src/content.tsx`, tests, index exports; add `"@uniview/tui-content": "workspace:*"` dep + `pnpm install`.

Port `packages/tui-react/src/content.ts`'s wrappers. `React.memo` is unnecessary in Solid (component bodies run once); wrap the builder call in `createMemo` so it re-runs only when its reactive inputs change.
- `Markdown({ content, ...opts })` → `renderMarkdown`.
- `Code({ content, language, filename, ...opts })` → resolve `lang = language ?? (filename ? detectLanguage(filename) : opts.lang)` → `renderCode`.
- `Diff({ patch, language, ...opts })` → `renderDiff`.
- `StreamingMarkdown` → `splitStableMarkdown(content)` → a column `box` with a stable `Markdown` + a tail `Markdown`.

- [ ] RED → GREEN → check-types → build → commit `feat(tui-solid): Markdown/Code/Diff content components`.

---

## Task 9 — `ScrollView` / `Hoverable` / `CommandPalette` / `Select` / `VirtualList`

**Files:** `packages/tui-solid/src/{interactive,select,virtual-list}.tsx`, tests, index exports.

Mechanical ports (`useState` → `createSignal`; the pure `clampScroll`/`filterCommands` come from tui-core per Task 2; `computeVirtualWindow` already lives in tui-core):
- `ScrollView` — controlled when `onScrollChange` is provided, else internal `createSignal(0)`; wheel + key scrolling via `clampScroll`.
- `Hoverable` — `createSignal(false)`; child is a render-prop `(hovered: Accessor<boolean>) => JSX.Element`.
- `CommandPalette` — no state, absolute overlay (`zIndex: 100`), filters via `filterCommands`.
- `Select` — fully controlled, derives `index = options.indexOf(value)`.
- `VirtualList` — `createSignal(0)` scrollTop + `computeVirtualWindow`.

- [ ] RED → GREEN → check-types → build → commit `feat(tui-solid): ScrollView/Hoverable/CommandPalette/Select/VirtualList`.

---

## Task 10 — Solid lazygit demo (parity proof)

**Files:** `examples/tui-lazygit-solid/{package.json,tsconfig.json,vite? no,src/app.tsx,src/main.tsx,tests/app.test.tsx,README.md}`.

Port `examples/tui-lazygit-demo` to Solid — the end-to-end proof that Panel/List/StatusBar/focus/keyboard all work in Solid.
- **Boot:** mirror `examples/tui-lazygit-demo/src/main.tsx` — `onEvent`-based `TerminalDriver`, the non-TTY `ONCE` guard (`!process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1"` → render once + exit), Ctrl-C quit. Use `createTuiSolidRoot` instead of `createTuiReactRoot`.
- **The example needs the Solid JSX transform too** — it runs via `tsx`, which will NOT apply `babel-preset-solid`. Resolve this explicitly: either author the demo's components so they're compiled (a small build step / `vite-node` / a `tsx` loader hook), OR mirror Task 1's babel plugin for the example. **Investigate and pick one; if neither is clean, report BLOCKED** — do not ship a demo that only runs under vitest.
- State via signals (no `createState()`/`rerender()` shim — Solid updates the terminal reactively; that's the point of the demo).
- Tests mirror `examples/tui-lazygit-demo/tests/app.test.tsx`: five left panels + log panel titles; a status bar; digit keys switch the focused panel; arrows move the branch selection.

- [ ] Scaffold → `pnpm install` → RED → GREEN (3 tests) → check-types → `UNIVIEW_DEMO_ONCE=1 pnpm dev` smoke-test → README → commit `feat(examples): lazygit demo in Solid`.

---

## Done when

All 10 tasks committed; `pnpm check-types` clean in tui-core/tui-react/tui-solid/the demo; every suite green; whole-branch review of `<base>..HEAD` returns no Critical/Important.
