# @uniview/tui-forms-demo

A forms showcase exercising all four Phase 4 widgets from `@uniview/tui-react`:

- **`<Tabs>`** — a "Login" / "Status" tab strip + active panel. Focus the strip
  with Tab, then switch tabs with the arrow keys.
- **`<TextInput>`** — a name field and a masked password field on the Login tab.
- **`<LineGauge>`** — a labelled single-line progress bar on the Status tab.
- **`<Scrollbar>`** — a standalone scrollbar beside a log column on the Status tab.

`q` quits (via Phase 3's `useInput`).

## Run

```bash
pnpm --filter @uniview/tui-forms-demo dev     # Tab → arrows to switch tabs; q to quit
pnpm --filter @uniview/tui-forms-demo test
```
