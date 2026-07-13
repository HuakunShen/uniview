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
