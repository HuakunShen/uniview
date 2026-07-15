/**
 * What the plugin knows about the machine it is being displayed on.
 *
 * This is *state*, not events. React Native draws the same line: a view is a
 * declarative host component, but "is the system in dark mode" is a value you
 * read (`Appearance.getColorScheme()`) and subscribe to. It never belongs in the
 * UI tree, and it never belongs in the plugin's own props — the host owns it.
 *
 * Note what is deliberately NOT solved here. `bg-card` does not consult this:
 * semantic color tokens travel to the host as names and are resolved natively,
 * per view, so they change with the appearance without a re-render or a round
 * trip. This is for the decisions only the plugin can make — which chart palette,
 * which illustration, whether to animate at all.
 */
export type ColorScheme = "light" | "dark";

export interface HostEnvironment {
  /** Dark or light, as the *host* resolves it — a window may override the system. */
  colorScheme: ColorScheme;
  /** The user's accent color, if the platform has one (macOS: `controlAccentColor`). */
  accentColor?: string;
  /** The user asked for less motion. Honour it: skip the animation, don't shorten it. */
  reduceMotion?: boolean;
  /** The user asked for higher contrast. */
  highContrast?: boolean;
  /** Whether the application is frontmost. */
  active?: boolean;
}

export const DEFAULT_HOST_ENVIRONMENT: HostEnvironment = {
  colorScheme: "light",
};
