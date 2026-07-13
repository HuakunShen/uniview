# Style + Commit Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TypeScript foundation for the native desktop framework — a new `@uniview/style` package that resolves Tailwind classNames + style objects into a normalized `ResolvedStyle` object, plus an additive `CommitBatch{revision, mutations}` model in `@uniview/protocol`.

**Architecture:** `@uniview/style` is a pure, dependency-free package: a `ResolvedStyle` schema (the box/visual/typography contract native hosts consume), a `Theme` (color + spacing tokens), and a `resolveStyle({className, style})` function that parses a documented Tailwind subset and deep-merges an explicit style object on top (object wins). The protocol change adds a `CommitBatch` type and an optional `applyCommit` RPC method with a Zod validator — additive, so no `PROTOCOL_VERSION` bump. Style resolution runs plugin-side; the resolved object travels in `props.style`, keeping native hosts dumb and `@uniview/protocol` product-agnostic.

**Tech Stack:** TypeScript (strict), tsdown (build → `.mjs`), Vitest (tests), Zod (protocol validators only), pnpm workspace + turbo.

## Global Constraints

- **No type suppression:** `@ts-ignore`, `@ts-expect-error`, `as any` are forbidden (inherited repo rule).
- **TypeScript:** `strict: true`, `noUnusedLocals: true`, `verbatimModuleSyntax: true`, `isolatedModules: true`, `emitDeclarationOnly: true` (tsdown emits JS). Mirror `packages/protocol/tsconfig.json` exactly.
- **ESM outputs:** `.mjs` via tsdown; package `exports` point at `./dist/index.mjs`, types at `./dist/index.d.mts`.
- **Formatting:** repo uses Prettier defaults (no config file) — 2-space indent, semicolons, double quotes. Run `pnpm format` (root `prettier --write "**/*.{ts,tsx,md}"`) before every commit.
- **Protocol stays product-agnostic:** never put Tailwind logic or product primitives in `@uniview/protocol`. The style schema lives only in `@uniview/style`.
- **Additive protocol change:** keep `PROTOCOL_VERSION = 3`. `applyCommit` is an **optional** interface method so existing host implementations do not break.
- **Package convention:** CLAUDE.md says packages are normally created via `pnpm create tsdown@latest`. For plan determinism we hand-author the three config files with the exact contents below — they replicate the tsdown `default` template's output (identical to `@uniview/protocol`'s config). `packages/*` is already globbed in `pnpm-workspace.yaml`, and `turbo.json` tasks are generic, so no workspace/turbo registration is needed.

---

## File Structure

**New package `@uniview/style`** (`packages/style/`):
- `package.json` — package manifest (no runtime deps)
- `tsconfig.json` — mirrors protocol
- `tsdown.config.ts` — mirrors protocol
- `src/index.ts` — re-exports
- `src/types.ts` — `ResolvedStyle`, `StyleInput`, `Dimension`, style enums (no runtime)
- `src/theme.ts` — `Theme` type, `defaultTheme`, `darkTheme`
- `src/resolve.ts` — `resolveClassName`, `normalizeStyleInput`, `resolveStyle`
- `tests/theme.test.ts` — theme token tests
- `tests/resolve.test.ts` — className + style-object + merge tests
- `README.md` — short usage doc

**Modified `@uniview/protocol`** (`packages/protocol/`):
- `src/mutations.ts` — add `CommitBatch` interface
- `src/rpc.ts` — add optional `applyCommit` to `PluginToHostAPI`
- `src/validators.ts` — add `CommitBatchSchema`, `validateCommitBatch`, `isValidCommitBatch`
- `tests/commit-batch.test.ts` — validator tests

---

## Part A — `@uniview/style`

### Task A1: Scaffold package + types + theme

**Files:**
- Create: `packages/style/package.json`
- Create: `packages/style/tsconfig.json`
- Create: `packages/style/tsdown.config.ts`
- Create: `packages/style/src/types.ts`
- Create: `packages/style/src/theme.ts`
- Create: `packages/style/src/index.ts`
- Test: `packages/style/tests/theme.test.ts`

**Interfaces:**
- Produces: `ResolvedStyle`, `StyleInput`, `Dimension`, `FlexDirection`, `JustifyContent`, `AlignItems`, `AlignSelf`, `FlexWrap`, `PositionType`, `TextAlign`, `FontWeight` (from `types.ts`); `Theme`, `defaultTheme`, `darkTheme` (from `theme.ts`).

- [ ] **Step 1: Create the three config files**

`packages/style/package.json`:

```json
{
  "name": "@uniview/style",
  "type": "module",
  "version": "0.0.1",
  "description": "Normalized style schema + Tailwind-subset resolver for Uniview native hosts",
  "license": "MIT",
  "exports": {
    ".": "./dist/index.mjs",
    "./package.json": "./package.json"
  },
  "types": "./dist/index.d.mts",
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "test": "vitest run",
    "check-types": "tsc --noEmit",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsdown": "0.22.2",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

`packages/style/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["es2023"],
    "moduleDetection": "force",
    "module": "preserve",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "types": ["node"],
    "strict": true,
    "noUnusedLocals": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`packages/style/tsdown.config.ts`:

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  exports: true,
});
```

- [ ] **Step 2: Create `src/types.ts`**

```ts
/**
 * Normalized, JSON-safe style contract shared between the plugin-side
 * resolver and every native host. Native hosts consume ResolvedStyle
 * directly (no Tailwind parsing on the native side). All fields optional;
 * an unset field means "inherit / engine default".
 */

/** A length: px number, percentage string, or "auto". */
export type Dimension = number | `${number}%` | "auto";

export type FlexDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type JustifyContent =
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly";
export type AlignItems =
  | "flex-start"
  | "center"
  | "flex-end"
  | "stretch"
  | "baseline";
export type AlignSelf = "auto" | AlignItems;
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
export type PositionType = "relative" | "absolute";
export type TextAlign = "left" | "center" | "right";
export type FontWeight = "normal" | "medium" | "semibold" | "bold";

/**
 * The resolved style object. Padding/margin are always expressed as the
 * four explicit edges (hosts map these straight onto Yoga edges).
 */
export interface ResolvedStyle {
  // Layout — flex container
  flexDirection?: FlexDirection;
  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  alignSelf?: AlignSelf;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: Dimension;
  flexWrap?: FlexWrap;
  gap?: number;
  // Layout — box edges
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  // Layout — sizing
  width?: Dimension;
  height?: Dimension;
  minWidth?: Dimension;
  minHeight?: Dimension;
  maxWidth?: Dimension;
  maxHeight?: Dimension;
  // Layout — positioning
  position?: PositionType;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  // Visual
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  // Typography
  color?: string;
  fontSize?: number;
  fontWeight?: FontWeight;
  fontFamily?: string;
  textAlign?: TextAlign;
  lineHeight?: number;
}

/**
 * The style-object shape authors may pass via `style={{ ... }}`. Extends
 * ResolvedStyle with padding/margin shorthands that the resolver expands
 * into the four explicit edges.
 */
export interface StyleInput extends ResolvedStyle {
  padding?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  margin?: number;
  marginHorizontal?: number;
  marginVertical?: number;
}
```

- [ ] **Step 3: Create `src/theme.ts`**

```ts
/**
 * Design tokens the resolver reads to turn Tailwind-like classes into
 * concrete values (colors, spacing, radii, font sizes).
 */
export interface Theme {
  /** Named color tokens → CSS/hex color strings. */
  colors: Record<string, string>;
  /** Spacing scale: token number → px (Tailwind-like: n → n*4). */
  spacing: (n: number) => number;
  /** Named border radii → px. Must include `default`. */
  radii: Record<string, number> & { default: number };
  /** Named font sizes → px. */
  fontSizes: Record<string, number>;
}

export const defaultTheme: Theme = {
  colors: {
    transparent: "transparent",
    background: "#ffffff",
    foreground: "#111111",
    primary: "#0a84ff",
    "primary-foreground": "#ffffff",
    secondary: "#5856d6",
    muted: "#f2f2f7",
    "muted-foreground": "#6b7280",
    border: "#d1d5db",
    card: "#ffffff",
    destructive: "#ff3b30",
  },
  spacing: (n) => n * 4,
  radii: { none: 0, sm: 4, md: 6, lg: 8, xl: 12, full: 9999, default: 6 },
  fontSizes: { xs: 11, sm: 12, base: 13, lg: 15, xl: 18, "2xl": 22, "3xl": 28 },
};

export const darkTheme: Theme = {
  ...defaultTheme,
  colors: {
    ...defaultTheme.colors,
    background: "#1e1e1e",
    foreground: "#f5f5f7",
    muted: "#2c2c2e",
    "muted-foreground": "#98989d",
    border: "#3a3a3c",
    card: "#2c2c2e",
  },
};
```

- [ ] **Step 4: Create `src/index.ts`**

```ts
export * from "./types";
export * from "./theme";
```

- [ ] **Step 5: Write the failing theme test**

`packages/style/tests/theme.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { darkTheme, defaultTheme } from "../src";

describe("theme", () => {
  test("spacing scale is Tailwind-like (n → n*4)", () => {
    expect(defaultTheme.spacing(0)).toBe(0);
    expect(defaultTheme.spacing(4)).toBe(16);
    expect(defaultTheme.spacing(2)).toBe(8);
  });

  test("default theme exposes core color tokens", () => {
    expect(defaultTheme.colors.background).toBe("#ffffff");
    expect(defaultTheme.colors.primary).toBe("#0a84ff");
    expect(defaultTheme.colors.border).toBeDefined();
  });

  test("radii include a default", () => {
    expect(defaultTheme.radii.default).toBe(6);
    expect(defaultTheme.radii.full).toBe(9999);
  });

  test("dark theme overrides background/foreground but keeps primary", () => {
    expect(darkTheme.colors.background).toBe("#1e1e1e");
    expect(darkTheme.colors.foreground).toBe("#f5f5f7");
    expect(darkTheme.colors.primary).toBe(defaultTheme.colors.primary);
  });
});
```

- [ ] **Step 6: Install and run the test to verify it passes**

Run:
```bash
pnpm install
pnpm --filter @uniview/style test
```
Expected: PASS (4 tests). `pnpm install` links the new workspace package.

- [ ] **Step 7: Verify build + types**

Run:
```bash
pnpm --filter @uniview/style build && pnpm --filter @uniview/style check-types
```
Expected: tsdown emits `packages/style/dist/index.mjs` + `dist/index.d.mts`; `tsc --noEmit` exits 0.

- [ ] **Step 8: Format and commit**

```bash
pnpm format
git add packages/style pnpm-lock.yaml
git commit -m "feat(style): scaffold @uniview/style with ResolvedStyle types + theme"
```

---

### Task A2: Tailwind-subset className resolver

**Files:**
- Create: `packages/style/src/resolve.ts`
- Modify: `packages/style/src/index.ts` (add `export * from "./resolve"`)
- Test: `packages/style/tests/resolve.test.ts`

**Interfaces:**
- Consumes: `ResolvedStyle`, `StyleInput`, `Dimension` (types.ts); `Theme`, `defaultTheme` (theme.ts).
- Produces: `resolveClassName(className: string, theme?: Theme): ResolvedStyle`. (Also lays down internal helpers `matchToken`, `parseDimensionToken` used by later tasks in this file — not exported.)

- [ ] **Step 1: Write the failing className test**

`packages/style/tests/resolve.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { defaultTheme, resolveClassName } from "../src";

describe("resolveClassName", () => {
  test("flex direction + wrap", () => {
    expect(resolveClassName("flex flex-row")).toMatchObject({
      flexDirection: "row",
    });
    expect(resolveClassName("flex-col")).toMatchObject({
      flexDirection: "column",
    });
    expect(resolveClassName("flex-wrap")).toMatchObject({ flexWrap: "wrap" });
  });

  test("alignment maps to flexbox values", () => {
    expect(resolveClassName("items-center")).toMatchObject({
      alignItems: "center",
    });
    expect(resolveClassName("justify-between")).toMatchObject({
      justifyContent: "space-between",
    });
  });

  test("gap and padding use the spacing scale", () => {
    expect(resolveClassName("gap-4")).toMatchObject({ gap: 16 });
    expect(resolveClassName("p-4")).toMatchObject({
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
    });
    expect(resolveClassName("px-2 py-1")).toMatchObject({
      paddingLeft: 8,
      paddingRight: 8,
      paddingTop: 4,
      paddingBottom: 4,
    });
    expect(resolveClassName("pt-3")).toMatchObject({ paddingTop: 12 });
  });

  test("margin shorthands", () => {
    expect(resolveClassName("m-2")).toMatchObject({
      marginTop: 8,
      marginRight: 8,
      marginBottom: 8,
      marginLeft: 8,
    });
    expect(resolveClassName("mx-4")).toMatchObject({
      marginLeft: 16,
      marginRight: 16,
    });
  });

  test("sizing: numeric, full, and auto", () => {
    expect(resolveClassName("w-10")).toMatchObject({ width: 40 });
    expect(resolveClassName("w-full")).toMatchObject({ width: "100%" });
    expect(resolveClassName("h-full")).toMatchObject({ height: "100%" });
    expect(resolveClassName("max-w-20")).toMatchObject({ maxWidth: 80 });
  });

  test("visual: bg, border, rounded, opacity", () => {
    expect(resolveClassName("bg-primary")).toMatchObject({
      backgroundColor: defaultTheme.colors.primary,
    });
    expect(resolveClassName("border")).toMatchObject({ borderWidth: 1 });
    expect(resolveClassName("border-2")).toMatchObject({ borderWidth: 2 });
    expect(resolveClassName("border-border")).toMatchObject({
      borderColor: defaultTheme.colors.border,
    });
    expect(resolveClassName("rounded")).toMatchObject({ borderRadius: 6 });
    expect(resolveClassName("rounded-lg")).toMatchObject({ borderRadius: 8 });
    expect(resolveClassName("opacity-50")).toMatchObject({ opacity: 0.5 });
  });

  test("typography: size, color, weight, align", () => {
    expect(resolveClassName("text-sm")).toMatchObject({ fontSize: 12 });
    expect(resolveClassName("text-primary")).toMatchObject({
      color: defaultTheme.colors.primary,
    });
    expect(resolveClassName("font-bold")).toMatchObject({ fontWeight: "bold" });
    expect(resolveClassName("text-center")).toMatchObject({
      textAlign: "center",
    });
  });

  test("unknown classes are ignored", () => {
    expect(resolveClassName("hover:foo not-a-class w-1/2")).toEqual({});
  });

  test("later classes override earlier ones", () => {
    expect(resolveClassName("flex-row flex-col")).toMatchObject({
      flexDirection: "column",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @uniview/style test resolve`
Expected: FAIL — `resolveClassName` is not exported.

- [ ] **Step 3: Implement `src/resolve.ts`**

```ts
import type { Dimension, ResolvedStyle } from "./types";
import { defaultTheme, type Theme } from "./theme";

/** Classes with a fixed mapping (no numeric argument). */
const STATIC_CLASSES: Record<string, ResolvedStyle> = {
  flex: {}, // recognized no-op: every node is already a flex box
  "flex-row": { flexDirection: "row" },
  "flex-col": { flexDirection: "column" },
  "flex-row-reverse": { flexDirection: "row-reverse" },
  "flex-col-reverse": { flexDirection: "column-reverse" },
  "flex-wrap": { flexWrap: "wrap" },
  "flex-nowrap": { flexWrap: "nowrap" },
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
  grow: { flexGrow: 1 },
  "grow-0": { flexGrow: 0 },
  shrink: { flexShrink: 1 },
  "shrink-0": { flexShrink: 0 },
  "flex-1": { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  border: { borderWidth: 1 },
  "w-full": { width: "100%" },
  "h-full": { height: "100%" },
  "font-normal": { fontWeight: "normal" },
  "font-medium": { fontWeight: "medium" },
  "font-semibold": { fontWeight: "semibold" },
  "font-bold": { fontWeight: "bold" },
  "text-left": { textAlign: "left" },
  "text-center": { textAlign: "center" },
  "text-right": { textAlign: "right" },
};

/** Parse a sizing token (`10`, `full`, `auto`) into a Dimension. */
function parseDimensionToken(
  token: string,
  theme: Theme,
): Dimension | undefined {
  if (token === "full") return "100%";
  if (token === "auto") return "auto";
  const n = Number(token);
  if (!Number.isNaN(n)) return theme.spacing(n);
  return undefined;
}

/** Resolve a single class token to a partial style, or null if unknown. */
function matchToken(token: string, theme: Theme): ResolvedStyle | null {
  const stat = STATIC_CLASSES[token];
  if (stat) return stat;

  let m: RegExpMatchArray | null;

  if ((m = token.match(/^gap-(\d+)$/))) return { gap: theme.spacing(+m[1]) };

  // padding
  if ((m = token.match(/^p-(\d+)$/))) {
    const v = theme.spacing(+m[1]);
    return { paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v };
  }
  if ((m = token.match(/^px-(\d+)$/))) {
    const v = theme.spacing(+m[1]);
    return { paddingLeft: v, paddingRight: v };
  }
  if ((m = token.match(/^py-(\d+)$/))) {
    const v = theme.spacing(+m[1]);
    return { paddingTop: v, paddingBottom: v };
  }
  if ((m = token.match(/^pt-(\d+)$/))) return { paddingTop: theme.spacing(+m[1]) };
  if ((m = token.match(/^pr-(\d+)$/)))
    return { paddingRight: theme.spacing(+m[1]) };
  if ((m = token.match(/^pb-(\d+)$/)))
    return { paddingBottom: theme.spacing(+m[1]) };
  if ((m = token.match(/^pl-(\d+)$/)))
    return { paddingLeft: theme.spacing(+m[1]) };

  // margin
  if ((m = token.match(/^m-(\d+)$/))) {
    const v = theme.spacing(+m[1]);
    return { marginTop: v, marginRight: v, marginBottom: v, marginLeft: v };
  }
  if ((m = token.match(/^mx-(\d+)$/))) {
    const v = theme.spacing(+m[1]);
    return { marginLeft: v, marginRight: v };
  }
  if ((m = token.match(/^my-(\d+)$/))) {
    const v = theme.spacing(+m[1]);
    return { marginTop: v, marginBottom: v };
  }
  if ((m = token.match(/^mt-(\d+)$/))) return { marginTop: theme.spacing(+m[1]) };
  if ((m = token.match(/^mr-(\d+)$/)))
    return { marginRight: theme.spacing(+m[1]) };
  if ((m = token.match(/^mb-(\d+)$/)))
    return { marginBottom: theme.spacing(+m[1]) };
  if ((m = token.match(/^ml-(\d+)$/))) return { marginLeft: theme.spacing(+m[1]) };

  // sizing
  if ((m = token.match(/^w-(.+)$/))) {
    const d = parseDimensionToken(m[1], theme);
    return d === undefined ? null : { width: d };
  }
  if ((m = token.match(/^h-(.+)$/))) {
    const d = parseDimensionToken(m[1], theme);
    return d === undefined ? null : { height: d };
  }
  if ((m = token.match(/^min-w-(.+)$/))) {
    const d = parseDimensionToken(m[1], theme);
    return d === undefined ? null : { minWidth: d };
  }
  if ((m = token.match(/^min-h-(.+)$/))) {
    const d = parseDimensionToken(m[1], theme);
    return d === undefined ? null : { minHeight: d };
  }
  if ((m = token.match(/^max-w-(.+)$/))) {
    const d = parseDimensionToken(m[1], theme);
    return d === undefined ? null : { maxWidth: d };
  }
  if ((m = token.match(/^max-h-(.+)$/))) {
    const d = parseDimensionToken(m[1], theme);
    return d === undefined ? null : { maxHeight: d };
  }

  // rounded
  if ((m = token.match(/^rounded-(.+)$/))) {
    const key = m[1];
    if (key in theme.radii) return { borderRadius: theme.radii[key] };
    const n = Number(key);
    return Number.isNaN(n) ? null : { borderRadius: n };
  }

  // border width (border-<n>) — border-<colorToken> handled below
  if ((m = token.match(/^border-(\d+)$/))) return { borderWidth: +m[1] };

  if ((m = token.match(/^opacity-(\d+)$/))) return { opacity: +m[1] / 100 };

  if ((m = token.match(/^bg-(.+)$/))) {
    const c = theme.colors[m[1]];
    return c ? { backgroundColor: c } : null;
  }

  if ((m = token.match(/^border-(.+)$/))) {
    const c = theme.colors[m[1]];
    return c ? { borderColor: c } : null;
  }

  if ((m = token.match(/^text-(.+)$/))) {
    const key = m[1];
    if (key in theme.fontSizes) return { fontSize: theme.fontSizes[key] };
    const c = theme.colors[key];
    return c ? { color: c } : null;
  }

  return null;
}

/**
 * Resolve a Tailwind-subset className string into a ResolvedStyle. Unknown
 * tokens are ignored. Later tokens override earlier ones.
 */
export function resolveClassName(
  className: string,
  theme: Theme = defaultTheme,
): ResolvedStyle {
  const out: ResolvedStyle = {};
  for (const token of className.trim().split(/\s+/).filter(Boolean)) {
    const partial = matchToken(token, theme);
    if (partial) Object.assign(out, partial);
  }
  return out;
}
```

- [ ] **Step 4: Add the export**

`packages/style/src/index.ts` — append:

```ts
export * from "./resolve";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @uniview/style test resolve`
Expected: PASS (all `resolveClassName` cases).

- [ ] **Step 6: Format and commit**

```bash
pnpm format
git add packages/style
git commit -m "feat(style): Tailwind-subset resolveClassName"
```

---

### Task A3: Style-object normalization + `resolveStyle`

**Files:**
- Modify: `packages/style/src/resolve.ts` (add `normalizeStyleInput`, `resolveStyle`, `StyleProps`)
- Test: `packages/style/tests/resolve.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `resolveClassName` (Task A2); `StyleInput`, `ResolvedStyle` (types.ts); `Theme`, `defaultTheme` (theme.ts).
- Produces: `StyleProps { className?: string; style?: StyleInput }`; `normalizeStyleInput(style: StyleInput): ResolvedStyle`; `resolveStyle(input: StyleProps, theme?: Theme): ResolvedStyle`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/style/tests/resolve.test.ts`:

```ts
import {
  normalizeStyleInput,
  resolveStyle,
} from "../src";

describe("normalizeStyleInput", () => {
  test("expands padding shorthand into four edges", () => {
    expect(normalizeStyleInput({ padding: 8 })).toEqual({
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
    });
  });

  test("horizontal/vertical override the all-sides shorthand", () => {
    expect(normalizeStyleInput({ padding: 8, paddingHorizontal: 16 })).toEqual({
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 16,
      paddingRight: 16,
    });
  });

  test("explicit edge overrides shorthands", () => {
    expect(normalizeStyleInput({ padding: 8, paddingTop: 2 })).toEqual({
      paddingTop: 2,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
    });
  });

  test("passes through non-shorthand fields untouched", () => {
    expect(
      normalizeStyleInput({ flexDirection: "row", backgroundColor: "#fff" }),
    ).toEqual({ flexDirection: "row", backgroundColor: "#fff" });
  });
});

describe("resolveStyle", () => {
  test("className only", () => {
    expect(resolveStyle({ className: "flex-row gap-2" })).toMatchObject({
      flexDirection: "row",
      gap: 8,
    });
  });

  test("style object only, with shorthand expansion", () => {
    expect(resolveStyle({ style: { padding: 4, flexGrow: 1 } })).toMatchObject({
      paddingTop: 4,
      paddingLeft: 4,
      flexGrow: 1,
    });
  });

  test("style object wins over className on conflict", () => {
    const r = resolveStyle({
      className: "flex-row bg-primary",
      style: { flexDirection: "column" },
    });
    expect(r.flexDirection).toBe("column");
    expect(r.backgroundColor).toBe("#0a84ff");
  });

  test("empty input resolves to empty style", () => {
    expect(resolveStyle({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @uniview/style test resolve`
Expected: FAIL — `normalizeStyleInput` / `resolveStyle` not exported.

- [ ] **Step 3: Implement in `src/resolve.ts`**

Append to `packages/style/src/resolve.ts`:

```ts
import type { StyleInput } from "./types";

/** Props a component accepts for styling. */
export interface StyleProps {
  className?: string;
  style?: StyleInput;
}

/**
 * Expand padding/margin shorthands in a style object into the four explicit
 * edges. Precedence (low → high): all-sides → horizontal/vertical → edge.
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

  const pTop = out.paddingTop ?? paddingVertical ?? padding;
  const pBottom = out.paddingBottom ?? paddingVertical ?? padding;
  const pLeft = out.paddingLeft ?? paddingHorizontal ?? padding;
  const pRight = out.paddingRight ?? paddingHorizontal ?? padding;
  if (pTop !== undefined) out.paddingTop = pTop;
  if (pBottom !== undefined) out.paddingBottom = pBottom;
  if (pLeft !== undefined) out.paddingLeft = pLeft;
  if (pRight !== undefined) out.paddingRight = pRight;

  const mTop = out.marginTop ?? marginVertical ?? margin;
  const mBottom = out.marginBottom ?? marginVertical ?? margin;
  const mLeft = out.marginLeft ?? marginHorizontal ?? margin;
  const mRight = out.marginRight ?? marginHorizontal ?? margin;
  if (mTop !== undefined) out.marginTop = mTop;
  if (mBottom !== undefined) out.marginBottom = mBottom;
  if (mLeft !== undefined) out.marginLeft = mLeft;
  if (mRight !== undefined) out.marginRight = mRight;

  return out;
}

/**
 * Resolve className + style object into one ResolvedStyle. The style object
 * takes precedence over className on conflicting fields.
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
```

> Note: `StyleInput` is imported at the point of use above; if your bundler/`verbatimModuleSyntax` prefers a single import site, merge this `import type { StyleInput }` into the existing `import type { Dimension, ResolvedStyle } from "./types";` line at the top of the file instead. Keep exactly one import from `./types`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @uniview/style test`
Expected: PASS (theme + all resolve suites).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @uniview/style check-types`
Expected: exit 0 (no unused locals, no type errors).

- [ ] **Step 6: Format and commit**

```bash
pnpm format
git add packages/style
git commit -m "feat(style): normalizeStyleInput + resolveStyle (className+style merge)"
```

---

### Task A4: Package README + build gate

**Files:**
- Create: `packages/style/README.md`

**Interfaces:** none (documentation + verification only).

- [ ] **Step 1: Write `packages/style/README.md`**

````markdown
# @uniview/style

Normalized style schema and a Tailwind-subset resolver for Uniview native
hosts. Style resolution runs plugin-side; the resulting `ResolvedStyle`
object travels in `props.style`, so native hosts (AppKit, WinUI, …) consume
concrete numbers/enums and never parse Tailwind.

```ts
import { resolveStyle } from "@uniview/style";

const style = resolveStyle({
  className: "flex flex-row gap-4 p-4 bg-background rounded-lg",
  style: { alignItems: "center" }, // wins on conflict
});
// → { flexDirection: "row", gap: 16, paddingTop: 16, ..., backgroundColor: "#ffffff",
//     borderRadius: 8, alignItems: "center" }
```

## Supported classes (first cut)

- **Flex:** `flex`, `flex-row|col[-reverse]`, `flex-wrap|nowrap`, `flex-1`,
  `grow[-0]`, `shrink[-0]`, `items-{start|center|end|stretch|baseline}`,
  `justify-{start|center|end|between|around|evenly}`, `self-*`, `gap-N`
- **Box:** `p{,x,y,t,r,b,l}-N`, `m{,x,y,t,r,b,l}-N`, `w-{N|full}`, `h-{N|full}`,
  `min-w/-h-N`, `max-w/-h-N`
- **Visual:** `bg-<token>`, `border`, `border-<n>`, `border-<colorToken>`,
  `rounded[-{sm|md|lg|xl|full|N}]`, `opacity-N`
- **Typography:** `text-<sizeToken>`, `text-<colorToken>`,
  `font-{normal|medium|semibold|bold}`, `text-{left|center|right}`

Unknown classes are ignored. Spacing scale: `N → N*4` px. Override tokens by
passing a custom `Theme` as the second argument to `resolveStyle`.
````

- [ ] **Step 2: Full package verification**

Run:
```bash
pnpm --filter @uniview/style build
pnpm --filter @uniview/style check-types
pnpm --filter @uniview/style test
```
Expected: build emits `dist/index.mjs` + `dist/index.d.mts`; check-types exits 0; all tests PASS.

- [ ] **Step 3: Commit**

```bash
pnpm format
git add packages/style
git commit -m "docs(style): add @uniview/style README"
```

---

## Part B — `@uniview/protocol` commit model

### Task B1: `CommitBatch` type + `applyCommit` + validator

**Files:**
- Modify: `packages/protocol/src/mutations.ts` (append `CommitBatch`)
- Modify: `packages/protocol/src/rpc.ts` (add optional `applyCommit`, extend the mutations import)
- Modify: `packages/protocol/src/validators.ts` (add schema + validators, extend the mutations import)
- Test: `packages/protocol/tests/commit-batch.test.ts`

**Interfaces:**
- Consumes: `Mutation`, `MutationsSchema` (existing).
- Produces: `CommitBatch { revision: number; mutations: Mutation[] }`; optional `PluginToHostAPI.applyCommit(batch: CommitBatch): void`; `CommitBatchSchema`; `validateCommitBatch(data): CommitBatch`; `isValidCommitBatch(data): data is CommitBatch`.

- [ ] **Step 1: Write the failing validator test**

`packages/protocol/tests/commit-batch.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  isValidCommitBatch,
  validateCommitBatch,
  type CommitBatch,
} from "../src";

describe("CommitBatch validation", () => {
  const good: CommitBatch = {
    revision: 1,
    mutations: [
      { type: "setProps", nodeId: "n1", props: { title: "Save" } },
      { type: "setText", nodeId: "t1", text: "Hello" },
    ],
  };

  test("accepts a well-formed batch", () => {
    expect(validateCommitBatch(good)).toEqual(good);
    expect(isValidCommitBatch(good)).toBe(true);
  });

  test("accepts an empty mutation list", () => {
    expect(isValidCommitBatch({ revision: 0, mutations: [] })).toBe(true);
  });

  test("rejects a negative or non-integer revision", () => {
    expect(isValidCommitBatch({ revision: -1, mutations: [] })).toBe(false);
    expect(isValidCommitBatch({ revision: 1.5, mutations: [] })).toBe(false);
  });

  test("rejects a missing revision", () => {
    expect(isValidCommitBatch({ mutations: [] })).toBe(false);
  });

  test("rejects an invalid mutation inside the batch", () => {
    expect(
      isValidCommitBatch({
        revision: 2,
        mutations: [{ type: "bogus", nodeId: "x" }],
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @uniview/protocol test commit-batch`
Expected: FAIL — `validateCommitBatch` / `isValidCommitBatch` / `CommitBatch` not exported.

- [ ] **Step 3: Add the `CommitBatch` type**

Append to `packages/protocol/src/mutations.ts`:

```ts
/**
 * A revisioned batch of mutations (Fabric-style commit). `revision` is a
 * monotonically increasing counter minted by the emitter; hosts apply
 * batches in revision order and may treat a re-delivered revision as an
 * idempotent no-op or a drift signal. Additive over the existing
 * `applyMutations` path — PROTOCOL_VERSION is unchanged.
 */
export interface CommitBatch {
  revision: number;
  mutations: Mutation[];
}
```

- [ ] **Step 4: Add the optional `applyCommit` method**

In `packages/protocol/src/rpc.ts`, change the mutations import to include `CommitBatch`:

```ts
import type { CommitBatch, Mutation } from "./mutations";
```

Then, inside `interface PluginToHostAPI`, add after `applyMutations(...)`:

```ts
  /**
   * Apply a revisioned commit batch to the UI tree.
   * Additive, optional counterpart to `applyMutations` — hosts that support
   * the commit/revision model implement this; others may omit it.
   */
  applyCommit?(batch: CommitBatch): void;
```

- [ ] **Step 5: Add the Zod schema + validators**

In `packages/protocol/src/validators.ts`, change the mutations import:

```ts
import type { CommitBatch, Mutation } from "./mutations";
```

Then append (after `MutationsSchema`):

```ts
/**
 * Validates a Fabric-style commit batch: a non-negative integer revision
 * plus a well-formed mutation array.
 */
export const CommitBatchSchema: z.ZodType<CommitBatch> = z.object({
  revision: z.number().int().nonnegative(),
  mutations: MutationsSchema,
});

export function validateCommitBatch(data: unknown): CommitBatch {
  return CommitBatchSchema.parse(data);
}

export function isValidCommitBatch(data: unknown): data is CommitBatch {
  return CommitBatchSchema.safeParse(data).success;
}
```

(`src/index.ts` already re-exports `./mutations` and `./validators`, so no export edits are needed.)

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @uniview/protocol test commit-batch`
Expected: PASS (5 tests).

- [ ] **Step 7: Full protocol verification**

Run:
```bash
pnpm --filter @uniview/protocol test
pnpm --filter @uniview/protocol build
pnpm --filter @uniview/protocol check-types
```
Expected: all existing + new tests PASS; build succeeds; check-types exits 0.

- [ ] **Step 8: Format and commit**

```bash
pnpm format
git add packages/protocol
git commit -m "feat(protocol): additive CommitBatch{revision,mutations} + applyCommit + validator"
```

---

## Part C — Workspace verification

### Task C1: Whole-repo build + type check

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Build everything**

Run: `pnpm build`
Expected: turbo builds all packages including the new `@uniview/style`; no errors.

- [ ] **Step 2: Type-check everything**

Run: `pnpm check-types`
Expected: exit 0 across the workspace.

- [ ] **Step 3: Run the full unit suite**

Run: `pnpm test`
Expected: all package test suites PASS (style + protocol + existing renderers/host-sdk).

- [ ] **Step 4: Confirm nothing else regressed, then commit any formatting**

```bash
git status
pnpm format
git add -A
git commit -m "chore: format after style+commit foundation" || echo "nothing to commit"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage** — This plan implements the spec's §5.1.A (`@uniview/style` package: `ResolvedStyle`, `Theme`, `resolveStyle` with Tailwind subset + style-object merge, unit-tested) and §5.1.C (additive `CommitBatch{revision, mutations}` + `applyCommit` + Zod validator, no version bump). Spec §5.1.B (`UniviewAppKit` Swift core), §5.1.D (demo app + example plugin), and §5.2/§5.3 verification are **deliberately out of scope** for this plan — they form Plan 2 (the native increment), which depends on the `ResolvedStyle` schema landed here.

**2. Placeholder scan** — No TBD/TODO/"handle edge cases"/"similar to". Every code step contains complete, runnable code and every command lists expected output.

**3. Type consistency** — `ResolvedStyle`/`StyleInput`/`Dimension`/`Theme` names are consistent across A1→A4. `resolveClassName` (A2) is consumed by `resolveStyle` (A3) under the same signature. `CommitBatch { revision, mutations }` is identical across mutations.ts, rpc.ts, validators.ts, and the B1 test. `matchToken`/`parseDimensionToken` are internal (not exported) and only referenced within `resolve.ts`.
