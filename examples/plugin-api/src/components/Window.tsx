import { createElement } from "react";
import type { ReactElement } from "react";

/**
 * The window's chrome, written in React.
 *
 * ```tsx
 * <Window title="Uniview" titlebar="transparent" trafficLights={{ x: 22, y: 22 }} />
 * ```
 *
 * A `<Window>` does not *create* a window — the app already has one before the
 * plugin ever connects. It configures it, the way React Native's `<StatusBar>`
 * configures a bar it doesn't own: a component that renders nothing, whose props
 * are applied to something already on screen. Like `<Menu>`, it is a *surface* —
 * native, but not a view — so it takes up no space and can sit anywhere in the
 * tree.
 *
 * Whatever you don't set is left alone, and everything you do set is restored
 * when the `<Window>` unmounts: a plugin that renames the window shouldn't
 * permanently rename the application.
 *
 * On a web host a `<Window>` has no meaning and is ignored.
 */
export interface WindowProps {
  title?: string;
  /**
   * `"default"` — a normal titlebar.
   * `"transparent"` — content runs under it and the app draws its own background
   * (the Music/Finder look); the traffic lights stay.
   * `"hidden"` — transparent, and the traffic lights are hidden too.
   */
  titlebar?: "default" | "transparent" | "hidden";
  /**
   * Nudge the traffic lights in from the window's top-left corner. An inset or
   * floating sidebar needs this to wrap them with even padding. Omit for the
   * OS default position.
   */
  trafficLights?: { x: number; y: number };
  /** Let a behind-window material blur the desktop through the whole app. */
  transparentBackground?: boolean;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  closable?: boolean;
  minimizable?: boolean;
}

export function Window(props: WindowProps): ReactElement {
  return createElement("Window", props);
}
