# @uniview/host-tui

The terminal **host**: it turns a serialized `UINode` tree into something
[`@uniview/tui-core`](../tui-core) can render, and routes input back to the handlers.

This is the layer that makes the TUI framework-agnostic. React and Solid each produce a
`UINode` tree; everything below this point is shared, which is why the same component renders
identically under both.

```
React / Solid  →  UINode tree  →  [host-tui]  →  RenderNode  →  tui-core  →  cells
     ▲                                  │
     └──────────  handler ids  ◀────────┘   (input routing)
```

## What's in here

**`uinodeToRenderNode`** (`convert.ts`) — the single place props are interpreted. `title`,
`borderColor`, `backgroundColor`, style keys, event handlers. **Both framework bindings depend
on this**, so changing it changes React and Solid together — that is the point, and also why
it needs care.

**`TuiHost`** — owns the tree, the handler registry, and the cell↔node ownership map.
`nodeAt(x, y)` hit-tests; `nearestTarget(id, events)` and `nearestFocusable(id)` walk up the
ancestor chain; `fireEvent` / `fireEventBubbling` dispatch.

**`InputRouter`** — normalized terminal events → component handlers. Focus (Tab / click),
hover (`onMouseEnter` / `onMouseLeave`), wheel, keys, text input.

**`AutomationSession`** + `semantics.ts` — query the rendered tree by role/label and drive it
programmatically. This is how a TUI can be tested (or scripted) without a terminal.

## Input routing, precisely

Getting this wrong is the source of most "why doesn't my key do anything" bugs:

- A **click** focuses the nearest *focusable ancestor* of the node under the cursor — not the
  raw hit node, which is usually a leaf (the label inside a row) and cannot take focus.
- **Keys** go to the focused node, then **bubble** to the nearest ancestor with an `onKeyDown` —
  the same way clicks bubble. Without this, clicking a list row and then pressing ↓ would do
  nothing, because rows carry `onClick`, not `onKeyDown`.
- **Enter / Space** activate the focused node *before* bubbling, so a focused row inside a
  keymapped list fires its own `onClick` instead of feeding the list.
- Digits and letters arrive as `text` events; named keys (`ArrowDown`, `Tab`) as `key` events.

## Development

```bash
pnpm test          # vitest
pnpm check-types   # tsc --noEmit — vitest and tsdown do NOT type-check
pnpm build         # tsdown
```
