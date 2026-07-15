# TUI Phase 1 — lazygit-style Layout & Components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the lazygit layout class — bordered, titled, focusable panels in a weighted multi-panel arrangement, with scrollable selectable lists and a keybinding status bar.

**Architecture:** All rendering lives in `tui-core` (paint layer) and `host-tui` (prop conversion); `tui-react` adds thin `Panel`/`List`/`StatusBar` components and a focus helper. Titled borders are painted into the border edges at the paint layer; every other piece composes existing primitives (`box`/`text`, geometric hit-testing, `computeVirtualWindow`). No protocol change — `title`/`footer`/`borderColor` ride freeform `UINode.props`.

**Tech Stack:** TypeScript (esnext, `verbatimModuleSyntax`, `isolatedModules`, strict, `noUnusedLocals`), React 19 reconciler (`@uniview/react-renderer`), Vitest, tsdown. No `as any` / `@ts-ignore` / `@ts-expect-error`.

**Reference:** design spec `.planning/specs/2026-07-14-tui-layout-charts-design.md`; screenshot detail `.planning/specs/2026-07-14-reference-uis.md`; source `~/Dev/others/lazygit`.

## Global Constraints

- Run tests per-package from the package dir: `cd packages/<pkg> && pnpm vitest run`.
- Downstream packages import `tui-core`/`host-tui` from `dist` — after editing a lib's `src`, run `pnpm --filter @uniview/<pkg> build` before dependent demos/tests pick it up.
- No `as any`, `@ts-ignore`, `@ts-expect-error`. Prefer explicit types.
- TDD: write the failing test, watch it fail, minimal implementation, watch it pass, commit.
- Commit after each task with a `feat(scope):` / `test(scope):` message.
- Colors accept a name/CSS string or `{ r, g, b }` (`Color` type). Reuse `defaultTheme.colors` for defaults where possible.

---

## File Structure

**tui-core** (paint layer):
- Modify `packages/tui-core/src/paint/paint.ts` — add `title`/`titleAlign`/`footer`/`footerAlign` to `RenderNode`; paint them into border edges (`drawEdgeText`).
- Create `packages/tui-core/src/layout/engine.ts` — `LayoutEngine` interface + `customLayoutEngine`.
- Modify `packages/tui-core/src/index.ts` — export the layout engine.

**host-tui** (prop conversion):
- Modify `packages/host-tui/src/convert.ts` — map `title`/`titleAlign`/`footer`/`footerAlign`/`borderColor` props onto box `RenderNode`s.

**tui-react** (components):
- Create `packages/tui-react/src/panel.tsx` — `Panel`.
- Create `packages/tui-react/src/list.tsx` — `List` + `listCounter`.
- Create `packages/tui-react/src/status-bar.tsx` — `StatusBar`.
- Create `packages/tui-react/src/focus.ts` — `nextFocus` reducer + `useFocusList` hook.
- Modify `packages/tui-react/src/index.ts` — export the above.

**example**:
- Create `examples/tui-lazygit-demo/` — the lazygit-clone demo (package.json, tsconfig.json, src/app.tsx, src/main.tsx, tests/app.test.tsx, README.md).

---

## Task 1: LayoutEngine interface

**Files:**
- Create: `packages/tui-core/src/layout/engine.ts`
- Modify: `packages/tui-core/src/index.ts`
- Test: `packages/tui-core/tests/layout/engine.test.ts`

**Interfaces:**
- Consumes: `computeLayout(root, container)`, `LayoutInput`, `LayoutResult` from `./layout`; `Size` from `../surface/types`.
- Produces: `interface LayoutEngine { computeLayout(root: LayoutInput, container: Size): LayoutResult }`; `const customLayoutEngine: LayoutEngine`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tui-core/tests/layout/engine.test.ts
import { describe, expect, it } from "vitest";
import { computeLayout, customLayoutEngine, type LayoutInput } from "../../src/index";

describe("customLayoutEngine", () => {
  it("delegates to computeLayout identically", () => {
    const root: LayoutInput = {
      style: { flexDirection: "row" },
      children: [{ style: { width: 4, height: 1 } }, { style: { flexGrow: 1, height: 1 } }],
    };
    const size = { width: 20, height: 3 };
    const viaEngine = customLayoutEngine.computeLayout(root, size);
    const direct = computeLayout(root, size);
    expect(viaEngine.box).toEqual(direct.box);
    expect(viaEngine.children[1]!.box.width).toBe(direct.children[1]!.box.width);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui-core && pnpm vitest run tests/layout/engine.test.ts`
Expected: FAIL — `customLayoutEngine` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/tui-core/src/layout/engine.ts
import { computeLayout, type LayoutInput, type LayoutResult } from "./layout";
import type { Size } from "../surface/types";

/**
 * A pluggable layout engine. The default {@link customLayoutEngine} is the
 * built-in pure-TS flexbox; alternative engines (e.g. a Yoga adapter) implement
 * the same interface so hosts can swap correctness/portability trade-offs.
 */
export interface LayoutEngine {
  computeLayout(root: LayoutInput, container: Size): LayoutResult;
}

/** The built-in flexbox engine (no dependencies; runs in Worker/Deno/Bun). */
export const customLayoutEngine: LayoutEngine = { computeLayout };
```

Add to `packages/tui-core/src/index.ts` after the `computeLayout` export block (around line 102):

```ts
export { customLayoutEngine } from "./layout/engine";
export type { LayoutEngine } from "./layout/engine";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/tui-core && pnpm vitest run tests/layout/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tui-core/src/layout/engine.ts packages/tui-core/src/index.ts packages/tui-core/tests/layout/engine.test.ts
git commit -m "feat(tui-core): pluggable LayoutEngine interface, custom default"
```

---

## Task 2: Titled / footered borders (paint layer)

**Files:**
- Modify: `packages/tui-core/src/paint/paint.ts`
- Test: `packages/tui-core/tests/paint/titled-border.test.ts`

**Interfaces:**
- Consumes: `stringCellWidth` (already imported in paint.ts), `drawBorder`, `borderGlyphs`, `RenderNode`.
- Produces: `RenderNode.title?: string`, `RenderNode.titleAlign?: "left"|"center"|"right"`, `RenderNode.footer?: string`, `RenderNode.footerAlign?: "left"|"center"|"right"`. Title paints into the top border row, footer into the bottom border row, using `node.borderStyle`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tui-core/tests/paint/titled-border.test.ts
import { describe, expect, it } from "vitest";
import { StyleTable } from "../../src/style/style-table";
import { renderToBuffer, type RenderNode } from "../../src/paint/paint";
import { frameToText } from "../../src/buffer/frame";

function rowText(root: RenderNode, w: number, h: number, y: number): string {
  const styles = new StyleTable();
  const { buffer } = renderToBuffer(root, { width: w, height: h }, styles);
  return frameToText(buffer, styles, { trimRight: false }).split("\n")[y] ?? "";
}

describe("titled borders", () => {
  it("paints the title into the top border edge", () => {
    const node: RenderNode = { type: "box", style: { border: "rounded", width: 14, height: 3 }, title: "Status" };
    const top = rowText(node, 14, 3, 0);
    expect(top.startsWith("╭")).toBe(true);
    expect(top).toContain("Status");
    expect(top.endsWith("╮")).toBe(true);
  });

  it("right-aligns a footer into the bottom border edge", () => {
    const node: RenderNode = {
      type: "box",
      style: { border: "rounded", width: 14, height: 3 },
      footer: "1 of 8",
      footerAlign: "right",
    };
    const bottom = rowText(node, 14, 3, 2);
    expect(bottom.startsWith("╰")).toBe(true);
    expect(bottom.endsWith("╯")).toBe(true);
    // "1 of 8" (6 cells) sits just before the right corner (col 13): cols 7..12
    expect(bottom.slice(7, 13)).toBe("1 of 8");
  });

  it("clips a title too wide for the panel to the inner width", () => {
    const node: RenderNode = { type: "box", style: { border: "single", width: 8, height: 3 }, title: "VeryLongTitle" };
    const top = rowText(node, 8, 3, 0);
    expect(top.startsWith("┌")).toBe(true);
    expect(top.endsWith("┐")).toBe(true);
    expect([...top].length).toBe(8); // no overflow past the corners
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui-core && pnpm vitest run tests/paint/titled-border.test.ts`
Expected: FAIL — `title`/`footer` not painted (top row has no "Status").

- [ ] **Step 3: Write minimal implementation**

In `packages/tui-core/src/paint/paint.ts`, add fields to the `RenderNode` interface (after `borderStyle?`):

```ts
  /** Text drawn into the top border edge (a panel title). */
  title?: string;
  titleAlign?: "left" | "center" | "right";
  /** Text drawn into the bottom border edge (e.g. an "N of M" counter). */
  footer?: string;
  footerAlign?: "left" | "center" | "right";
```

Add a helper below `drawBorder`:

```ts
/** Paint short text into a horizontal border edge (title on top, footer on bottom). */
function drawEdgeText(
  buffer: CellBuffer,
  box: Rect,
  clip: Rect,
  edgeY: number,
  text: string,
  align: "left" | "center" | "right",
  styleId: number,
  ownerId: number,
): void {
  if (!text || box.width < 3) return;
  if (edgeY < clip.y || edgeY >= clip.y + clip.height) return;
  const innerLeft = box.x + 1; // just after the left corner
  const innerRight = box.x + box.width - 1; // the right corner column
  const innerWidth = innerRight - innerLeft;
  if (innerWidth <= 0) return;
  const w = Math.min(stringCellWidth(text), innerWidth);
  let start = innerLeft;
  if (align === "center") start = innerLeft + Math.max(0, Math.floor((innerWidth - w) / 2));
  else if (align === "right") start = innerRight - w;
  buffer.writeText(start, edgeY, text, styleId, ownerId, undefined, innerRight);
}
```

Replace the border-drawing block in `paintNode` (currently lines ~184-187) with:

```ts
  const glyphs = borderGlyphs(node.style?.border);
  if (glyphs) {
    const borderStyleId = styles.intern(node.borderStyle ?? {});
    drawBorder(buffer, box, boxClip, glyphs, borderStyleId, ownerId);
    if (node.title) {
      drawEdgeText(buffer, box, boxClip, box.y, node.title, node.titleAlign ?? "left", borderStyleId, ownerId);
    }
    if (node.footer) {
      drawEdgeText(buffer, box, boxClip, box.y + box.height - 1, node.footer, node.footerAlign ?? "left", borderStyleId, ownerId);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/tui-core && pnpm vitest run tests/paint/titled-border.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole tui-core suite (no regressions)**

Run: `cd packages/tui-core && pnpm vitest run`
Expected: PASS (all prior tests still green).

- [ ] **Step 6: Build tui-core (downstream reads dist)**

Run: `pnpm --filter @uniview/tui-core build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/tui-core/src/paint/paint.ts packages/tui-core/tests/paint/titled-border.test.ts
git commit -m "feat(tui-core): titled/footered borders painted into the border edges"
```

---

## Task 3: borderColor + title/footer props in the host converter

**Files:**
- Modify: `packages/host-tui/src/convert.ts`
- Test: `packages/host-tui/tests/convert.test.ts` (append; if absent, create with the imports shown)

**Interfaces:**
- Consumes: `uinodeToRenderNode`, `asColor` (module-private — the test drives it through `uinodeToRenderNode`), `UINode`.
- Produces: box `RenderNode`s now carry `title`/`titleAlign`/`footer`/`footerAlign` from props, and `borderStyle = { fg }` from a `borderColor` prop.

- [ ] **Step 1: Write the failing test**

```ts
// packages/host-tui/tests/convert.test.ts  (append to the existing describe file)
import { describe, expect, it } from "vitest";
import { uinodeToRenderNode } from "../src/convert";
import type { UINode } from "@uniview/protocol";

const box = (props: Record<string, unknown>): UINode => ({
  id: "p", type: "box", props: props as UINode["props"], children: [],
});

describe("convert — panel chrome props", () => {
  it("maps title/footer/align and borderColor onto the render node", () => {
    const node = uinodeToRenderNode(
      box({ border: "rounded", title: "Status", footer: "1 of 8", footerAlign: "right", borderColor: "green" }),
    );
    expect(node).not.toBeNull();
    expect(node!.title).toBe("Status");
    expect(node!.footer).toBe("1 of 8");
    expect(node!.footerAlign).toBe("right");
    expect(node!.borderStyle).toEqual({ fg: "green" });
  });

  it("accepts an { r, g, b } borderColor", () => {
    const node = uinodeToRenderNode(box({ border: "single", borderColor: { r: 0, g: 255, b: 0 } }));
    expect(node!.borderStyle).toEqual({ fg: { r: 0, g: 255, b: 0 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/host-tui && pnpm vitest run tests/convert.test.ts`
Expected: FAIL — `node.title` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `packages/host-tui/src/convert.ts`, add a helper above `uinodeToRenderNode`:

```ts
type EdgeAlign = "left" | "center" | "right";
function asAlign(value: JSONValue | undefined): EdgeAlign | undefined {
  return value === "left" || value === "center" || value === "right" ? value : undefined;
}
```

In the final (box) branch of `uinodeToRenderNode`, after the `background` assignment and before `return rendered;`, add:

```ts
  if (typeof node.props.title === "string") rendered.title = node.props.title;
  const titleAlign = asAlign(node.props.titleAlign);
  if (titleAlign) rendered.titleAlign = titleAlign;
  if (typeof node.props.footer === "string") rendered.footer = node.props.footer;
  const footerAlign = asAlign(node.props.footerAlign);
  if (footerAlign) rendered.footerAlign = footerAlign;
  const borderColor = asColor(node.props.borderColor);
  if (borderColor !== undefined) rendered.borderStyle = { fg: borderColor };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/host-tui && pnpm vitest run tests/convert.test.ts`
Expected: PASS.

- [ ] **Step 5: Build host-tui**

Run: `pnpm --filter @uniview/host-tui build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/host-tui/src/convert.ts packages/host-tui/tests/convert.test.ts
git commit -m "feat(host-tui): thread title/footer/borderColor props to render nodes"
```

---

## Task 4: Panel component

**Files:**
- Create: `packages/tui-react/src/panel.tsx`
- Modify: `packages/tui-react/src/index.ts`
- Test: `packages/tui-react/tests/panel.test.tsx`

**Interfaces:**
- Consumes: `createElement`, `TuiCommonProps` (from `./primitives`), `Color` (from `@uniview/tui-core`).
- Produces: `Panel(props: PanelProps): ReactElement`; `interface PanelProps extends TuiCommonProps { title?, titleAlign?, footer?, footerAlign?, focused?, focusedColor?, borderColor? }`. Defaults: `border="rounded"`, `focusedColor="green"`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/tui-react/tests/panel.test.tsx
import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Panel } from "../src/panel";

const tick = () => new Promise((r) => setTimeout(r, 20));
function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

describe("Panel", () => {
  it("renders a titled border and a right-aligned footer", async () => {
    const { surface } = mount(h(Panel, { title: "Status", footer: "1 of 8", footerAlign: "right", width: 14, height: 3 }), 14, 3);
    await tick();
    const lines = surface.text({ trimRight: false }).split("\n");
    expect(lines[0]).toContain("Status");
    expect(lines[2]!.slice(7, 13)).toBe("1 of 8");
  });

  it("colors the border green when focused", async () => {
    const { surface, styles } = mount(h(Panel, { title: "Branches", focused: true, width: 12, height: 3 }), 12, 3);
    await tick();
    const frame = surface.cells()!;
    const topLeft = frame.cells[0]![0]!; // the ╭ corner glyph
    expect(styles.get(topLeft.styleId).fg).toBe("green");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui-react && pnpm vitest run tests/panel.test.tsx`
Expected: FAIL — cannot find `../src/panel`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/tui-react/src/panel.tsx
import { createElement, type ReactElement } from "react";
import type { Color } from "@uniview/tui-core";
import type { TuiCommonProps } from "./primitives";

/** A bordered, titled, focusable panel — the lazygit window primitive. */
export interface PanelProps extends TuiCommonProps {
  title?: string;
  titleAlign?: "left" | "center" | "right";
  footer?: string;
  footerAlign?: "left" | "center" | "right";
  /** When true, the border uses {@link PanelProps.focusedColor}. */
  focused?: boolean;
  /** Border color while focused. Defaults to `"green"`. */
  focusedColor?: Color;
  /** Border color while not focused (default terminal color when unset). */
  borderColor?: Color;
}

export function Panel(props: PanelProps): ReactElement {
  const { title, titleAlign, footer, footerAlign, focused, focusedColor = "green", borderColor, border, children, ...rest } = props;
  const resolvedBorderColor = focused ? focusedColor : borderColor;
  return createElement(
    "box",
    { ...rest, border: border ?? "rounded", title, titleAlign, footer, footerAlign, borderColor: resolvedBorderColor },
    children,
  );
}
```

Add to `packages/tui-react/src/index.ts`:

```ts
export { Panel } from "./panel";
export type { PanelProps } from "./panel";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/tui-react && pnpm vitest run tests/panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tui-react/src/panel.tsx packages/tui-react/src/index.ts packages/tui-react/tests/panel.test.tsx
git commit -m "feat(tui-react): Panel — titled, footered, focusable border"
```

---

## Task 5: List component (full-row selection, keyboard + mouse, keep-visible scroll)

**Files:**
- Create: `packages/tui-react/src/list.tsx`
- Modify: `packages/tui-react/src/index.ts`
- Test: `packages/tui-react/tests/list.test.tsx`

**Interfaces:**
- Consumes: `createElement`, `useState`, `useEffect` (react); `TuiKeyEvent`, `TuiPointerEvent` (from `./primitives`); `Color` (from `@uniview/tui-core`).
- Produces:
  - `List<T>(props: ListProps<T>): ReactElement` where `ListProps<T> = { items: readonly T[]; selectedIndex: number; onSelect: (index: number) => void; renderItem?: (item: T, index: number, selected: boolean) => ReactNode; height?: number; width?: Dimension; selectedBackground?: Color; selectedColor?: Color }`.
  - `listCounter(selectedIndex: number, total: number): string` → `"N of M"` (or `"0 of 0"` when empty).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/tui-react/tests/list.test.tsx
import { describe, expect, it } from "vitest";
import { createElement as h, useState, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { List, listCounter } from "../src/list";

const tick = () => new Promise((r) => setTimeout(r, 20));
const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });
const click = (x: number, y: number): TuiInputEvent => ({ type: "mouse", action: "up", button: "left", x, y, ctrl: false, alt: false, shift: false });

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

// A controlled harness that owns selectedIndex.
function Harness({ items, height }: { items: string[]; height?: number }) {
  const [sel, setSel] = useState(0);
  return h(List<string>, { items, selectedIndex: sel, onSelect: setSel, height, width: 16 });
}

describe("listCounter", () => {
  it("formats 1-based position", () => {
    expect(listCounter(0, 8)).toBe("1 of 8");
    expect(listCounter(7, 8)).toBe("8 of 8");
    expect(listCounter(0, 0)).toBe("0 of 0");
  });
});

describe("List", () => {
  it("highlights the whole selected row (bg spans full width)", async () => {
    const { surface, styles } = mount(h(Harness, { items: ["alpha", "beta", "gamma"] }), 16, 3);
    await tick();
    const frame = surface.cells()!;
    const bgAt = (x: number) => JSON.stringify(styles.get(frame.cells[0]![x]!.styleId).bg ?? null);
    const cols = [0, 3, 8, 12, 15].map(bgAt);
    expect(new Set(cols).size).toBe(1); // uniform across the row
    expect(cols[0]).not.toBe(JSON.stringify(null)); // and it IS a color
  });

  it("moves selection with arrow keys", async () => {
    const { root, surface, styles } = mount(h(Harness, { items: ["alpha", "beta", "gamma"] }), 16, 3);
    await tick();
    root.dispatchInput(key("Tab")); // focus the List (its root box has onKeyDown, first in focus order)
    root.dispatchInput(key("ArrowDown"));
    root.dispatchInput(key("ArrowDown"));
    await tick();
    const frame = surface.cells()!;
    const bg = (y: number, x: number) => styles.get(frame.cells[y]![x]!.styleId).bg;
    expect(bg(2, 0)).toBe("blue");    // "gamma" row now selected
    expect(bg(0, 0)).toBeUndefined(); // "alpha" no longer selected
  });

  it("selects a row by clicking its empty part", async () => {
    const seen: number[] = [];
    function Clickable() {
      const [sel, setSel] = useState(0);
      return h(List<string>, {
        items: ["alpha", "beta", "gamma"], selectedIndex: sel, width: 16,
        onSelect: (i: number) => { seen.push(i); setSel(i); },
      });
    }
    const { root } = mount(h(Clickable), 16, 3);
    await tick();
    root.dispatchInput(click(13, 1)); // empty part of row 1 ("beta")
    await tick();
    expect(seen).toContain(1);
  });

  it("scrolls to keep the selection visible", async () => {
    const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const { root, surface } = mount(h(Harness, { items, height: 4 }), 16, 4);
    await tick();
    root.dispatchInput(key("Tab")); // focus the List
    for (let i = 0; i < 10; i += 1) root.dispatchInput(key("ArrowDown"));
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("item-10"); // selected row is in view
    expect(text).not.toContain("item-0"); // window scrolled past the top
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui-react && pnpm vitest run tests/list.test.tsx`
Expected: FAIL — cannot find `../src/list`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/tui-react/src/list.tsx
import { createElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { Color, Dimension } from "@uniview/tui-core";
import type { TuiKeyEvent } from "./primitives";

export interface ListProps<T> {
  items: readonly T[];
  /** Controlled selection index. */
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Render a row. Defaults to `String(item)` in a `<text>`. */
  renderItem?: (item: T, index: number, selected: boolean) => ReactNode;
  /** Viewport height in rows. Defaults to the item count (no scrolling). */
  height?: number;
  width?: Dimension;
  /** Full-row highlight color for the selected row. Defaults to `"blue"`. */
  selectedBackground?: Color;
  /** Text color of the selected row. */
  selectedColor?: Color;
}

/** "N of M" position label (1-based), or "0 of 0" when empty. */
export function listCounter(selectedIndex: number, total: number): string {
  if (total <= 0) return "0 of 0";
  return `${Math.min(selectedIndex + 1, total)} of ${total}`;
}

export function List<T>(props: ListProps<T>): ReactElement {
  const { items, selectedIndex, onSelect, renderItem, width, selectedBackground = "blue", selectedColor } = props;
  const viewport = props.height ?? items.length;
  const maxScroll = Math.max(0, items.length - viewport);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    setScrollTop((s) => {
      if (selectedIndex < s) return selectedIndex;
      if (selectedIndex >= s + viewport) return selectedIndex - viewport + 1;
      return Math.min(s, maxScroll);
    });
  }, [selectedIndex, viewport, maxScroll]);

  const onKeyDown = (event: TuiKeyEvent): void => {
    const last = items.length - 1;
    if (last < 0) return;
    if (event.key === "ArrowDown") onSelect(Math.min(selectedIndex + 1, last));
    else if (event.key === "ArrowUp") onSelect(Math.max(selectedIndex - 1, 0));
    else if (event.key === "Home") onSelect(0);
    else if (event.key === "End") onSelect(last);
    else if (event.key === "PageDown") onSelect(Math.min(selectedIndex + viewport, last));
    else if (event.key === "PageUp") onSelect(Math.max(selectedIndex - viewport, 0));
  };

  const rows: ReactNode[] = [];
  const end = Math.min(items.length, scrollTop + viewport);
  for (let i = scrollTop; i < end; i += 1) {
    const selected = i === selectedIndex;
    const index = i;
    const content = renderItem
      ? renderItem(items[i]!, i, selected)
      : createElement("text", { color: selected ? selectedColor : undefined }, String(items[i]));
    rows.push(
      createElement(
        "box",
        {
          key: i,
          width: "100%",
          onClick: () => onSelect(index),
          backgroundColor: selected ? selectedBackground : undefined,
        },
        content,
      ),
    );
  }

  return createElement("box", { onKeyDown, flexDirection: "column", height: viewport, width }, ...rows);
}
```

Add to `packages/tui-react/src/index.ts`:

```ts
export { List, listCounter } from "./list";
export type { ListProps } from "./list";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/tui-react && pnpm vitest run tests/list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tui-react/src/list.tsx packages/tui-react/src/index.ts packages/tui-react/tests/list.test.tsx
git commit -m "feat(tui-react): List — full-row selection, keyboard + mouse, keep-visible scroll"
```

---

## Task 6: StatusBar component

**Files:**
- Create: `packages/tui-react/src/status-bar.tsx`
- Modify: `packages/tui-react/src/index.ts`
- Test: `packages/tui-react/tests/status-bar.test.tsx`

**Interfaces:**
- Consumes: `createElement` (react); `TuiCommonProps` (from `./primitives`).
- Produces: `StatusBar(props: StatusBarProps): ReactElement`; `interface StatusItem { label: string; keyHint: string }`; `interface StatusBarProps extends TuiCommonProps { items: readonly StatusItem[]; separator?: string }`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/tui-react/tests/status-bar.test.tsx
import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { StatusBar } from "../src/status-bar";

const tick = () => new Promise((r) => setTimeout(r, 20));
function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { surface };
}

describe("StatusBar", () => {
  it("renders label: key pairs joined by a separator", async () => {
    const { surface } = mount(
      h(StatusBar, { items: [ { label: "Checkout", keyHint: "<space>" }, { label: "Delete", keyHint: "d" } ] }),
      40, 1,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toContain("Checkout: <space> | Delete: d");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui-react && pnpm vitest run tests/status-bar.test.tsx`
Expected: FAIL — cannot find `../src/status-bar`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// packages/tui-react/src/status-bar.tsx
import { createElement, type ReactElement } from "react";
import type { TuiCommonProps } from "./primitives";

export interface StatusItem {
  label: string;
  keyHint: string;
}

export interface StatusBarProps extends TuiCommonProps {
  items: readonly StatusItem[];
  /** Separator between items. Defaults to `" | "`. */
  separator?: string;
}

/** A docked keybinding bar (lazygit's bottom row). */
export function StatusBar(props: StatusBarProps): ReactElement {
  const { items, separator = " | ", children, ...rest } = props;
  void children;
  const text = items.map((i) => `${i.label}: ${i.keyHint}`).join(separator);
  return createElement("box", { ...rest, flexDirection: "row" }, createElement("text", null, text));
}
```

Add to `packages/tui-react/src/index.ts`:

```ts
export { StatusBar } from "./status-bar";
export type { StatusBarProps, StatusItem } from "./status-bar";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/tui-react && pnpm vitest run tests/status-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tui-react/src/status-bar.tsx packages/tui-react/src/index.ts packages/tui-react/tests/status-bar.test.tsx
git commit -m "feat(tui-react): StatusBar — docked keybinding row"
```

---

## Task 7: Panel focus (nextFocus reducer + useFocusList hook)

**Files:**
- Create: `packages/tui-react/src/focus.ts`
- Modify: `packages/tui-react/src/index.ts`
- Test: `packages/tui-react/tests/focus.test.ts`

**Interfaces:**
- Consumes: `useState` (react); `TuiKeyEvent` (from `./primitives`).
- Produces:
  - `nextFocus(current: number, count: number, key: string, shift: boolean): number | null` — pure. `Tab` → next (wrap), `Shift+Tab` → prev (wrap), a digit `1..count` → that index-1, else `null` (unhandled).
  - `useFocusList(count: number, initial?: number): { focused: number; setFocused: (i: number) => void; handleKey: (e: TuiKeyEvent) => boolean }` — `handleKey` returns `true` if it consumed the key.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tui-react/tests/focus.test.ts
import { describe, expect, it } from "vitest";
import { nextFocus } from "../src/focus";

describe("nextFocus", () => {
  it("Tab cycles forward with wrap", () => {
    expect(nextFocus(0, 3, "Tab", false)).toBe(1);
    expect(nextFocus(2, 3, "Tab", false)).toBe(0);
  });
  it("Shift+Tab cycles backward with wrap", () => {
    expect(nextFocus(0, 3, "Tab", true)).toBe(2);
    expect(nextFocus(1, 3, "Tab", true)).toBe(0);
  });
  it("a digit jumps to that 1-based panel", () => {
    expect(nextFocus(0, 5, "3", false)).toBe(2);
    expect(nextFocus(0, 5, "5", false)).toBe(4);
  });
  it("returns null for out-of-range digits and other keys", () => {
    expect(nextFocus(0, 3, "9", false)).toBeNull();
    expect(nextFocus(0, 3, "x", false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui-react && pnpm vitest run tests/focus.test.ts`
Expected: FAIL — cannot find `../src/focus`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/tui-react/src/focus.ts
import { useState } from "react";
import type { TuiKeyEvent } from "./primitives";

/**
 * Compute the next focused index for a fixed list of `count` panels. Tab cycles
 * forward (Shift+Tab backward, both wrapping); a digit `1..count` jumps to that
 * panel. Returns `null` when the key does not affect focus.
 */
export function nextFocus(current: number, count: number, key: string, shift: boolean): number | null {
  if (count <= 0) return null;
  if (key === "Tab") return shift ? (current - 1 + count) % count : (current + 1) % count;
  if (/^[0-9]$/.test(key)) {
    const n = Number(key);
    if (n >= 1 && n <= count) return n - 1;
  }
  return null;
}

/** React binding over {@link nextFocus}. `handleKey` returns true if it consumed the key. */
export function useFocusList(count: number, initial = 0): {
  focused: number;
  setFocused: (i: number) => void;
  handleKey: (event: TuiKeyEvent) => boolean;
} {
  const [focused, setFocused] = useState(initial);
  const handleKey = (event: TuiKeyEvent): boolean => {
    const next = nextFocus(focused, count, event.key, event.shift);
    if (next === null) return false;
    setFocused(next);
    return true;
  };
  return { focused, setFocused, handleKey };
}
```

Add to `packages/tui-react/src/index.ts`:

```ts
export { nextFocus, useFocusList } from "./focus";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/tui-react && pnpm vitest run tests/focus.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole tui-react suite**

Run: `cd packages/tui-react && pnpm vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tui-react/src/focus.ts packages/tui-react/src/index.ts packages/tui-react/tests/focus.test.ts
git commit -m "feat(tui-react): panel focus — nextFocus reducer + useFocusList hook"
```

---

## Task 8: lazygit-clone demo

**Files:**
- Create: `examples/tui-lazygit-demo/package.json`
- Create: `examples/tui-lazygit-demo/tsconfig.json`
- Create: `examples/tui-lazygit-demo/src/app.tsx`
- Create: `examples/tui-lazygit-demo/src/main.tsx`
- Create: `examples/tui-lazygit-demo/tests/app.test.tsx`
- Create: `examples/tui-lazygit-demo/README.md`

**Interfaces:**
- Consumes: `Panel`, `List`, `listCounter`, `StatusBar`, `useFocusList`, `Box`, `Text`, `createTuiReactRoot` (from `@uniview/tui-react`); `MemoryCellSurface`, `StyleTable`, `TerminalDriver` (from `@uniview/tui-core`).
- Produces: `App({ state, host }): ReactElement`, `createState()`, `handleKey(state, host, event)` (mirrors the opencode-demo shape so it's headlessly testable), exported from `src/app.tsx`.

- [ ] **Step 1: Scaffold the package files**

`examples/tui-lazygit-demo/package.json`:

```json
{
  "name": "@uniview/tui-lazygit-demo",
  "type": "module",
  "version": "0.0.1",
  "private": true,
  "description": "A lazygit-style multi-panel TUI demo (panels, lists, focus, status bar)",
  "scripts": {
    "dev": "tsx src/main.tsx",
    "test": "vitest run",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@uniview/tui-core": "workspace:*",
    "@uniview/tui-react": "workspace:*",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

`examples/tui-lazygit-demo/tsconfig.json` (copy from `examples/tui-opencode-demo/tsconfig.json` verbatim — same jsx:"react-jsx" setup).

- [ ] **Step 2: Write the failing integration test**

```tsx
// examples/tui-lazygit-demo/tests/app.test.tsx
import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, handleKey, type AppHost } from "../src/app";

const tick = () => new Promise((r) => setTimeout(r, 20));
const keyEv = (k: string, shift = false): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift, meta: false });
const textEv = (t: string): TuiInputEvent => ({ type: "text", text: t });

function boot() {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width: 100, height: 30 } });
  const state = createState();
  const host: AppHost = { rerender: () => root.render(<App state={state} host={host} />), quit: () => {} };
  host.rerender();
  const send = (e: TuiInputEvent) => { if (e.type !== "mouse" && handleKey(state, host, e)) return; root.dispatchInput(e); };
  return { surface, send };
}
const screen = (s: ReturnType<typeof boot>) => s.surface.text({ trimRight: true });

describe("lazygit demo", () => {
  it("renders the five left panels + the log panel", async () => {
    const t = boot();
    await tick();
    const text = screen(t);
    for (const title of ["Status", "Files", "Local branches", "Commits", "Stash", "Log"]) {
      expect(text).toContain(title);
    }
  });

  it("shows a keybinding status bar", async () => {
    const t = boot();
    await tick();
    expect(screen(t)).toContain("Checkout:");
  });

  it("moves the branch selection with arrows when the branches panel is focused", async () => {
    const t = boot();
    await tick();
    t.send(textEv("3")); // focus [3] Local branches (a digit arrives as a text event)
    await tick();
    const before = screen(t);
    t.send(keyEv("ArrowDown"));
    await tick();
    expect(screen(t)).not.toBe(before); // selection highlight moved
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd examples/tui-lazygit-demo && pnpm vitest run`
Expected: FAIL — cannot find `../src/app`.

- [ ] **Step 4: Write the demo app**

```tsx
// examples/tui-lazygit-demo/src/app.tsx
import { createElement, type ReactElement } from "react";
import type { TuiInputEvent } from "@uniview/tui-core";
import { Box, List, Panel, StatusBar, listCounter, nextFocus } from "@uniview/tui-react";

export interface AppHost {
  rerender: () => void;
  quit: () => void;
}

export interface AppState {
  focused: number; // 0..5 → Status, Files, Branches, Commits, Stash, Log
  branch: number;
  commit: number;
}

const BRANCHES = ["feat/tui", "main", "codex-validation-e2e-audit", "debug", "fix-react", "vue-runtime", "backup"];
const COMMITS = ["9297a6f fix(tui-core): geometric hit-testing", "8973cc9 fix(tui-core): Escape handling", "3408146 fix(tui-core): text bg", "f6a117b docs: READMEs", "0e1aba2 refactor(examples): JSX"];
const STATUS_KEYS = [
  { label: "Checkout", keyHint: "<space>" },
  { label: "New branch", keyHint: "n" },
  { label: "Delete", keyHint: "d" },
  { label: "Rebase", keyHint: "r" },
  { label: "Keybindings", keyHint: "?" },
];

export function createState(): AppState {
  return { focused: 2, branch: 0, commit: 0 };
}

/**
 * Returns true if the event was handled (do not forward to the React tree).
 * Digits/letters arrive as `text` events; named keys (Tab/Arrow) as `key` events.
 */
export function handleKey(state: AppState, host: AppHost, event: TuiInputEvent): boolean {
  if (event.type === "key" && event.ctrl && event.key === "c") { host.quit(); return true; }
  const focusKey = event.type === "text" ? event.text : event.type === "key" ? event.key : "";
  const shift = event.type === "key" ? event.shift : false;
  const nf = nextFocus(state.focused, 6, focusKey, shift);
  if (nf !== null) { state.focused = nf; host.rerender(); return true; }
  if (event.type === "key" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    const d = event.key === "ArrowDown" ? 1 : -1;
    const step = (max: number, cur: number) => Math.max(0, Math.min(max, cur + d));
    if (state.focused === 2) state.branch = step(BRANCHES.length - 1, state.branch);
    else if (state.focused === 3) state.commit = step(COMMITS.length - 1, state.commit);
    host.rerender();
    return true;
  }
  return false;
}

export function App({ state }: { state: AppState; host: AppHost }): ReactElement {
  const left = createElement(
    Box,
    { flexDirection: "column", width: 34, height: "100%" },
    createElement(Panel, { title: "[1]-Status", focused: state.focused === 0, height: 3 }, createElement(Box, null, "uniview → feat/tui")),
    createElement(Panel, { title: "[2]-Files", focused: state.focused === 1, footer: "0 of 0", footerAlign: "right", flexGrow: 1 }),
    createElement(
      Panel,
      { title: "[3]-Local branches", focused: state.focused === 2, footer: listCounter(state.branch, BRANCHES.length), footerAlign: "right", flexGrow: 2 },
      createElement(List<string>, { items: BRANCHES, selectedIndex: state.branch, onSelect: () => {}, width: "100%" }),
    ),
    createElement(
      Panel,
      { title: "[4]-Commits", focused: state.focused === 3, footer: listCounter(state.commit, COMMITS.length), footerAlign: "right", flexGrow: 2 },
      createElement(List<string>, { items: COMMITS, selectedIndex: state.commit, onSelect: () => {}, width: "100%" }),
    ),
    createElement(Panel, { title: "[5]-Stash", focused: state.focused === 4, footer: "1 of 9", footerAlign: "right", height: 3 }, createElement(Box, null, "5M On main: WIP on main")),
  );
  const right = createElement(
    Box,
    { flexDirection: "column", flexGrow: 1, height: "100%" },
    createElement(Panel, { title: "[0]-Log", focused: state.focused === 5, flexGrow: 1 }, createElement(Box, null, `commit ${COMMITS[state.commit]}`)),
  );
  return createElement(
    Box,
    { flexDirection: "column", width: "100%", height: "100%" },
    createElement(Box, { flexDirection: "row", flexGrow: 1 }, left, right),
    createElement(StatusBar, { items: STATUS_KEYS }),
  );
}
```

```tsx
// examples/tui-lazygit-demo/src/main.tsx
import { createElement } from "react";
import { StyleTable, TerminalDriver, AnsiCellSurface, InputParser } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, handleKey, type AppHost } from "./app";

const cols = process.stdout.columns ?? 100;
const rows = process.stdout.rows ?? 30;
const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (s: string) => process.stdout.write(s), styles });
const root = createTuiReactRoot({ surface, styles, size: { width: cols, height: rows } });
const state = createState();
const host: AppHost = { rerender: () => root.render(createElement(App, { state, host })), quit: () => { driver.stop(); process.exit(0); } };
host.rerender();

const parser = new InputParser();
const driver = new TerminalDriver({
  input: process.stdin, output: process.stdout, mouse: "motion",
  onData: (chunk: Buffer) => {
    parser.push(chunk);
    for (const ev of parser.takeEvents()) {
      if (ev.type !== "mouse" && handleKey(state, host, ev)) continue;
      root.dispatchInput(ev);
    }
  },
});
driver.start();
```

> Note: verify `AnsiCellSurface` / `TerminalDriver` constructor options against `examples/tui-opencode-demo/src/main.tsx` and match them exactly; adjust the boot wiring to whatever that demo does (it is the known-good reference for real-terminal boot).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd examples/tui-lazygit-demo && pnpm vitest run`
Expected: PASS (all three tests).

- [ ] **Step 6: Manually verify in a real terminal**

Run: `cd examples/tui-lazygit-demo && pnpm dev`
Expected: the multi-panel layout renders; number keys `1`–`5`/`0` switch the focused (green-bordered) panel; arrows move the branch/commit selection; Ctrl-C quits.

- [ ] **Step 7: Write the README**

`examples/tui-lazygit-demo/README.md` — describe what it demonstrates (Panel/List/StatusBar/focus), how to run (`pnpm --filter @uniview/tui-lazygit-demo dev`), and the keybindings. Follow the format of `examples/tui-opencode-demo/README.md`.

- [ ] **Step 8: Commit**

```bash
git add examples/tui-lazygit-demo
git commit -m "feat(examples): lazygit-style multi-panel demo"
```

---

## Self-Review (completed at authoring time)

- **Spec coverage (Phase 1):** titled/footered borders (Task 2/3), Panel (4), List with full-row selection + keyboard + mouse + keep-visible scroll (5), StatusBar (6), panel focus system (7), LayoutEngine interface (1), lazygit demo (8). All Phase-1 deliverables from the spec map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code. The only soft spot is the demo boot in Task 8 Step 4 (real-terminal wiring), which is explicitly cross-checked against the known-good `tui-opencode-demo/src/main.tsx`.
- **Type consistency:** `Color`/`Dimension` imported from `@uniview/tui-core`; `TuiKeyEvent`/`TuiCommonProps` from `./primitives`; `nextFocus` used identically in Task 7 and Task 8; `List` prop shape identical across Task 5 and Task 8.
