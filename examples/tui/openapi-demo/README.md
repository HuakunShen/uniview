# @uniview/tui-openapi-demo

A browse-only **OpenAPI explorer** — a multi-pane terminal app over a bundled
Swagger Petstore spec, modelled on ratatui [`openapi-tui`](https://github.com/zaghaghi/openapi-tui).

```bash
pnpm --filter @uniview/tui-openapi-demo dev
```

Keys: `Tab` switch pane · `↑`/`↓` move · `→`/`←` expand / collapse a schema node ·
`f` cycle tag filter · `q` or `Ctrl-C` quit.

## Panes

- **Operations** (left) — every `METHOD /path` in the spec, color-coded by method,
  filterable by tag. A `<List>` with app-owned selection.
- **Details** (right, top) — the focused operation's summary, parameters, and
  request body.
- **Schema** (right, bottom) — the operation's request/response schemas as a
  **collapsible typed tree with `$ref` drill-down**. This is `openapi-tui`'s heart
  (`schema_viewer.rs`), here a `<Tree>` fed by a pure JSON-Schema → tree converter.

## How it works

Every piece is an existing uniview primitive — **no renderer changes**:

| openapi-tui | uniview |
|---|---|
| Focused pane + thick green border | `<Panel focused>` (lazygit accordion model) |
| `focused_pane_index` + FocusNext/Prev | app-owned `pane` state cycled by `Tab` |
| APIs list | `<List>` with a custom `renderItem` (colored method) |
| `$ref` schema drill-down | `<Tree>` + the `schemaToTree` converter |
| footer keybindings | `<StatusBar>` |

The interesting reusable core is `src/openapi.ts` — a small, framework-agnostic,
unit-tested OpenAPI model:

- `listOperations` / `listTags` — flatten `paths × methods`.
- `resolveRef` — resolve a local `#/components/schemas/...` reference.
- `schemaToTree` — turn a JSON-Schema into a collapsible typed tree, resolving
  `$ref`s **inline** and terminating cycles (e.g. `Category.parent → Category`)
  with a `↻` leaf instead of recursing forever.

Keyboard navigation of the schema tree reuses `tui-core`'s pure `TreeMachine`:
the app replays each arrow key through a fresh machine seeded from its controlled
state (exactly how the `<Tree>` component drives itself) and lifts the resulting
select/expand/collapse effects back into React state.

### What "browse-only" leaves out

`openapi-tui` also **executes** requests (editable params/body, response viewer,
embedded jq). That half is deliberately omitted here: real HTTP is exactly what a
Node/Bun **bridge plugin** is for (the sandboxed Worker path can't open arbitrary
sockets), and it would make the canonical bridge-plugin I/O example. The browse
half hits every existing primitive with zero live I/O.
