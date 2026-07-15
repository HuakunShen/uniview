/**
 * Props the native hosts understand that the DOM does not.
 *
 * React's own JSX types describe a *browser*, so a prop a native host reads —
 * `keyDownEvents`, `material` — is a type error on a `<div>` even though it
 * crosses the wire perfectly well (every JSON prop does). This declares them, so
 * the tree that renders natively also type-checks.
 *
 * They are additive and optional: a web host ignores them, and a plugin that
 * doesn't use them writes exactly the JSX it wrote before.
 */
declare module "react" {
  interface HTMLAttributes<T> {
    /**
     * The keys this element wants — and *only* these keys ever reach `onKeyDown`.
     *
     * ```tsx
     * <div keyDownEvents={["Escape", "ArrowDown", "ArrowUp", "cmd+k"]}
     *      onKeyDown={(e) => …} />
     * ```
     *
     * Declaring is not a filter for convenience; it is the whole mechanism. A
     * native host cannot stream every keystroke to a plugin that may be in
     * another process or on another machine — the letter would arrive after the
     * key, and every key the plugin ignored would have been stolen from the
     * responder chain on the way there (⌘C, the arrows inside a text field, IME
     * composition). What is declared is claimed; what isn't is never seen and
     * never taken.
     *
     * A chord names a key and its modifiers: `"Escape"`, `"ArrowDown"`,
     * `"shift+Tab"`, `"cmd+k"`. A *modified* chord fires wherever focus happens
     * to be, including inside a text field — which is what ⌘K in a palette means.
     * An unmodified one goes to whoever has focus, so give the element `autoFocus`
     * (or let the user click it) if it is meant to be the one listening.
     *
     * On a text input this is what lets a search field drive the list below it:
     * a focused field turns ArrowDown into a caret move before anything else can
     * see it, unless the field says it wants that key instead.
     */
    keyDownEvents?: string[];
    /**
     * Back this container with native vibrancy — `"sidebar"`, `"popover"`,
     * `"hud"`, `"under-window"`… The full non-deprecated `NSVisualEffectView` set,
     * under the names Electron's `vibrancy` and Tauri's `Effect` already use.
     */
    material?: string;
  }
}

export {};
