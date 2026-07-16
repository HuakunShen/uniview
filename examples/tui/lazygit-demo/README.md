# @uniview/tui-lazygit-demo

A lazygit-style multi-panel terminal UI built on the Uniview TUI stack —
five focusable side panels, a full-row selectable list, and a docked
keybinding status bar.

```bash
pnpm --filter @uniview/tui-lazygit-demo dev
```

## Panels

- **[1] Status** — current repo/branch summary.
- **[2] Files** — placeholder file-changes panel.
- **[3] Local branches** — a selectable branch list (full-row highlight).
- **[4] Commits** — a selectable commit list (full-row highlight).
- **[5] Stash** — placeholder stash summary.
- **[0] Log** — shows the commit under the current selection.

The focused panel is drawn with a green border; a `StatusBar` along the
bottom shows the active keybindings.

## Controls

| Input | Action |
| --- | --- |
| `1`-`5`, `0` | focus that panel |
| `↑ ↓` | move the branch selection (when Branches is focused) or the commit selection (when Commits is focused) |
| `Ctrl-C` | quit |

## How it works

The app logic lives in [`src/app.tsx`](src/app.tsx) as a pure function of
state — `App({ state, host })` composes `Panel`, `List`, `StatusBar`, and
`nextFocus` from `@uniview/tui-react`, rendered through the real React →
UINode → host → cells pipeline. [`src/main.tsx`](src/main.tsx) is just the
terminal boot (surface + driver).

Because the whole view is a pure `App(state, host)`, the interactions are
integration-tested headlessly against a `MemoryCellSurface` — see
[`tests/app.test.tsx`](tests/app.test.tsx).
