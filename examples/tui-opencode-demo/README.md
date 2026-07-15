# @uniview/tui-opencode-demo

A multi-page, opencode-style terminal UI built on the Uniview TUI stack —
scrollable Markdown / code / diff, a command-palette dialog, and full
keyboard **and** mouse interaction (including hover).

```bash
pnpm --filter @uniview/tui-opencode-demo dev
```

## Pages

- **Chat** — a streaming assistant reply (Markdown: headings, lists, quotes,
  inline styles, a highlighted code block), scrollable and auto-following.
- **Code** — a file browser sidebar + a syntax-highlighted, line-numbered
  preview with a scrollbar.
- **Diff** — a reviewable unified diff (old/new gutters, +/- bands, highlight).

## Controls

| Input | Action |
| --- | --- |
| `1` `2` `3` | switch page |
| click a tab / file | switch page / open file |
| **hover** a tab, file, or command | highlight it (motion mouse tracking) |
| mouse **wheel** | scroll the content under the pointer |
| `↑ ↓` · `PgUp PgDn` · `Home End` · `j k` | scroll |
| `[` `]` | previous / next file (Code page) |
| **Ctrl-K** or `:` | open the command palette |
| in palette: type to filter · `↑ ↓` · `Enter` · `Esc` | navigate / pick / close |
| `t` | toggle theme (tokyo-night ↔ github-light) |
| `q` / `Ctrl-C` | quit |

## How it works

The app logic lives in [`src/app.tsx`](src/app.tsx) as a pure function of state
— rendered through the real React → UINode → host → cells pipeline, driven by
`@uniview/host-tui`'s input router (hover, wheel, click, keys). It composes
`ScrollView`, `CommandPalette`, `Hoverable`, and the content renderers from
`@uniview/tui-react` / `@uniview/tui-content`. [`src/main.tsx`](src/main.tsx) is
just the terminal boot (surface + driver + stream loop).

Because the whole view is a pure `App(state, host)`, the interactions are
integration-tested headlessly against a `MemoryCellSurface` — see
[`tests/app.test.tsx`](tests/app.test.tsx).
