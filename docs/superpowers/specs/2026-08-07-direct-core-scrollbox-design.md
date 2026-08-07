# Direct-Core Scrollable TUI Design

## Goal

Give Uniview's framework-neutral TUI path a correct, reusable foundation for a bounded, scrollable list, then demonstrate it with a direct-core Space Lens example and consume the published package from `space-lens`.

## Context

The current direct-core renderer accepts `overflow: "visible" | "hidden" | "scroll"`, but painting always clips descendants to the parent box and never applies a scroll offset. The custom layout engine also does not distribute negative free space to `flexShrink` children. As a result, a panel containing many one-row children becomes content-sized and its bottom border is placed below the terminal. OpenTUI's `ScrollBox` solves this with a bounded viewport, local scroll state, content offset, and optional viewport culling.

Uniview remains framework- and app-agnostic: the core owns geometry, clipping, and pure scrolling math; the direct-core example owns application state, key bindings, and the visual scrollbar.

## Design

### Core layout

Implement negative free-space distribution for explicit `flexShrink` values in the custom layout engine. A child with `flexShrink: 1` can shrink from its intrinsic main-axis size until the parent’s available main-axis space is filled, while fixed header rows remain unchanged. Preserve existing default behavior for nodes that do not opt into shrinking, and keep the custom and Yoga engines equivalent for the new fixture.

### Core paint

Add a vertical `scrollTop` style value. The paint pipeline will:

- honor `overflow: "visible"` by passing the ancestor clip to descendants;
- keep `overflow: "hidden"` clipped to the node box;
- keep `overflow: "scroll"` clipped to the node box and translate descendants upward by `scrollTop`;
- leave borders, titles, backgrounds, and the scroll container’s own hit region at the unshifted box;
- clamp no state internally; callers use the existing `clampScroll`/`VirtualListMachine` APIs.

This is a controlled, framework-neutral primitive. Keyboard, mouse-wheel, and scrollbar policy stay in the caller or binding.

### Scroll state

Extend `VirtualListMachine` with `setItemCount` and `setViewportHeight`, preserving a valid `scrollTop` after data or terminal resize changes. Existing `ensureVisible`, `scrollBy`, and `window` semantics remain the source of truth for one-row lists.

### Example

Add `examples/tui/space-lens` as a direct-core Bun/Node example. It will render a large synthetic directory tree in a titled rounded panel, show a bounded viewport and scrollbar, keep the active row visible while moving with `j/k` and arrow keys, support Home/End/PageUp/PageDown, handle resize, and always destroy the app on `q`, Ctrl-C, or stdin end. The example’s `view(state)` remains pure and renders only the visible row window.

### Space Lens integration

After publication, update `space-lens` to consume the released `@uniview/tui-core` version and use the same bounded-panel approach for its scan and cleanup panes. Remove the local `file:` dependency once the published package is verified.

## Verification

- Core tests prove flex shrink geometry, visible/hidden/scroll clipping, scroll translation, and viewport state clamping.
- Existing core, React, and Solid tests remain green.
- The new example type-checks, builds, and is exercised in a real TTY with movement, resize, and clean shutdown.
- The Uniview release workflow runs its full TUI verification, dry-run, and publish orchestration on a clean synchronized `main` branch.
- `space-lens` type-checks/tests/builds against the published package and no longer resolves the core package from a local sibling path.
