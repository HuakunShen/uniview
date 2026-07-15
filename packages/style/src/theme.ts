import { tailwindPalette } from "./palette";
import type { BoxShadow } from "./types";

/**
 * Design tokens the resolver reads to turn Tailwind-like classes into
 * concrete values (colors, spacing, radii, font sizes, named widths).
 */
export interface Theme {
  /** Named color tokens → CSS/hex color strings. */
  colors: Record<string, string>;
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
  /** Spacing scale: token number → px (Tailwind-like: n → n*4). */
  spacing: (n: number) => number;
  /** Named border radii → px. Must include `default`. */
  radii: Record<string, number> & { default: number };
  /** Named font sizes → px. */
  fontSizes: Record<string, number>;
  /** Named drop shadows. Must include `default` (the bare `shadow` class). */
  shadows: Record<string, BoxShadow> & { default: BoxShadow };
  /** Named line-height multiples (`leading-tight` → 1.25). */
  leadings: Record<string, number>;
  /** Named sizes for `w-` / `max-w-` etc. (Tailwind's `max-w-md` scale) → px. */
  sizes: Record<string, number>;
}

/**
 * The semantic vocabulary — shadcn's token names, mapped onto colors the OS owns.
 * Every one of these has a native counterpart the host resolves per view; the hex
 * here is what a web host (or a TS-resolving theme) uses.
 */
const SEMANTIC_COLORS: Record<string, string> = {
  background: "#ffffff",
  foreground: "#111111",
  primary: "#0a84ff",
  "primary-foreground": "#ffffff",
  // The color the *user* chose in System Settings — the host resolves the name to
  // `controlAccentColor`, and this hex is only the fallback for a host that can't.
  // Missing until now, which meant `bg-accent` resolved to nothing at all and the
  // class was silently dropped.
  accent: "#0a84ff",
  "accent-foreground": "#ffffff",
  secondary: "#5856d6",
  muted: "#f2f2f7",
  "muted-foreground": "#6b7280",
  border: "#d1d5db",
  card: "#ffffff",
  destructive: "#ff3b30",
};

export const defaultTheme: Theme = {
  colors: {
    // The full Tailwind palette (`zinc-400`, `emerald-500/…`) …
    ...tailwindPalette,
    // … plus semantic tokens, which override any palette name they collide with.
    ...SEMANTIC_COLORS,
  },
  // …and those semantic tokens — and *only* those — are handed to the host by
  // name. `bg-emerald-500` is a literal: an author who writes it wants that green
  // in both appearances, which is what it means in Tailwind too.
  nativeTokens: new Set(Object.keys(SEMANTIC_COLORS)),
  spacing: (n) => n * 4,
  radii: {
    none: 0,
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    "2xl": 16,
    "3xl": 24,
    full: 9999,
    default: 6,
  },
  fontSizes: {
    xs: 11,
    sm: 12,
    base: 13,
    lg: 15,
    xl: 18,
    "2xl": 22,
    "3xl": 28,
    "4xl": 34,
  },
  // Tailwind's elevation scale, as geometry. A host can't invent these — and one
  // that hardcodes them (as this one used to) can draw exactly one shadow.
  shadows: {
    none: { offsetX: 0, offsetY: 0, radius: 0, color: "transparent" },
    sm: { offsetX: 0, offsetY: 1, radius: 2, color: "#0000000d" },
    default: { offsetX: 0, offsetY: 1, radius: 3, color: "#0000001a" },
    md: { offsetX: 0, offsetY: 4, radius: 6, color: "#0000001a" },
    lg: { offsetX: 0, offsetY: 10, radius: 15, color: "#0000001a" },
    xl: { offsetX: 0, offsetY: 20, radius: 25, color: "#0000001a" },
    "2xl": { offsetX: 0, offsetY: 25, radius: 50, color: "#00000040" },
  },
  leadings: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
  sizes: {
    xs: 320,
    sm: 384,
    md: 448,
    lg: 512,
    xl: 576,
    "2xl": 672,
    "3xl": 768,
    "4xl": 896,
    "5xl": 1024,
    "6xl": 1152,
    "7xl": 1280,
  },
};

/**
 * The TS-resolved escape hatch: same tokens, but every one of them freezes to a
 * hex. Use these when you want a palette the OS has no opinion about — a custom
 * brand theme, a web host, or a plugin that swaps themes itself from
 * `useColorScheme()`. Nothing here follows the system appearance on its own.
 */
export const lightTheme: Theme = {
  ...defaultTheme,
  nativeTokens: new Set(),
};

export const darkTheme: Theme = {
  ...defaultTheme,
  nativeTokens: new Set(),
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
