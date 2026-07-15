import { createElement } from "react";
import type { ReactElement } from "react";

/**
 * The blur behind the whole window — the full non-deprecated
 * `NSVisualEffectView.Material` set, under the exact names Electron's `vibrancy`
 * and Tauri's `Effect` already use.
 *
 * They are *semantic*, not visual: `sidebar` is not "a bit of grey", it is
 * "whatever the OS currently thinks a sidebar looks like", and it changes with
 * the system theme, the wallpaper behind the window, and the macOS version. That
 * is the whole point of asking for a material instead of picking a colour.
 *
 * `under-window` and `under-page` blur the *desktop* behind the window; the rest
 * blur what's inside it. Only the first two need `transparent`.
 */
export type Vibrancy =
  | "titlebar"
  | "selection"
  | "menu"
  | "popover"
  | "sidebar"
  | "header"
  | "sheet"
  | "window"
  | "hud"
  | "fullscreen-ui"
  | "tooltip"
  | "content"
  | "under-window"
  | "under-page";

/** `NSWindow.Level`. `alwaysOnTop` is the shorthand for `"floating"`. */
export type WindowLevel =
  | "normal"
  | "floating"
  | "modal-panel"
  | "main-menu"
  | "status"
  | "pop-up-menu"
  | "screen-saver";

/**
 * The window's chrome, written in React.
 *
 * ```tsx
 * <Window
 *   title="Uniview"
 *   titleBarStyle="hiddenInset"
 *   vibrancy="under-window"
 *   transparent
 * />
 * ```
 *
 * A `<Window>` does not *create* a window — the app already has one before the
 * plugin ever connects. It configures it, the way React Native's `<StatusBar>`
 * configures a bar it doesn't own: a component that renders nothing, whose props
 * are applied to something already on screen. Like `<Menu>`, it is a *surface* —
 * native, but not a view — so it takes up no space and can sit anywhere in the
 * tree.
 *
 * The names follow Electron's `BrowserWindow`, because that's the vocabulary
 * desktop authors already have. Whatever you don't set is left alone, and
 * everything you do set is restored when the `<Window>` unmounts: a plugin that
 * renames the window shouldn't permanently rename the application.
 *
 * On a web host a `<Window>` has no meaning and is ignored.
 */
export interface WindowProps {
  title?: string;
  /** The dot in the close button: "this document has unsaved changes". */
  documentEdited?: boolean;

  // ---- Chrome ----
  /**
   * `"default"` — an ordinary titlebar.
   * `"hidden"` — the titlebar becomes a transparent overlay and the content runs
   * the full height of the window; the traffic lights stay where the OS puts them.
   * `"hiddenInset"` — the same, with the lights inset (override with
   * `trafficLightPosition`).
   */
  titleBarStyle?: "default" | "hidden" | "hiddenInset";
  /** `false` removes the titlebar entirely — no lights, no OS chrome at all. */
  frame?: boolean;
  /** Show the title text. Independent of `titleBarStyle`. */
  titleVisible?: boolean;
  /** Show or hide all three traffic lights. */
  windowButtonsVisible?: boolean;
  /** …or one at a time. */
  windowButtons?: { close?: boolean; minimize?: boolean; maximize?: boolean };
  /**
   * Move the traffic lights in from the window's top-left corner. An inset or
   * floating sidebar needs this to wrap them with even padding. Clear it to send
   * them back to the OS default corner.
   */
  trafficLightPosition?: { x: number; y: number };

  // ---- Appearance ----
  vibrancy?: Vibrancy;
  /** Whether the blur survives the window losing focus. Default: it doesn't. */
  visualEffectState?: "followWindow" | "active" | "inactive";
  /** Required for `under-window` / `under-page` to blur the desktop through. */
  transparent?: boolean;
  backgroundColor?: string;
  hasShadow?: boolean;
  /** 0–1, the whole window. */
  opacity?: number;
  /**
   * Force light or dark for this window regardless of the system setting —
   * something a web `prefers-color-scheme` can never do to a native window.
   */
  appearance?: "light" | "dark" | "system";

  // ---- Behavior ----
  resizable?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  movable?: boolean;
  /** Drag the window by any empty area of its background, not just the titlebar. */
  movableByWindowBackground?: boolean;
  fullscreenable?: boolean;
  alwaysOnTop?: boolean;
  /** Finer than `alwaysOnTop` when you need it. */
  level?: WindowLevel;
  visibleOnAllWorkspaces?: boolean;
  hiddenInMissionControl?: boolean;

  // ---- Geometry ----
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export function Window(props: WindowProps): ReactElement {
  return createElement("Window", props);
}
