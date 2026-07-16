# @uniview/tui-table-demo

A file-list `<Table>` showcase from `@uniview/tui-react`:

- **column layout** (a flexing Name column + fixed Size/Kind columns),
- a **header row**,
- **virtualized rows** (only the visible slice paints),
- a highlighted **cursor row** moved with the arrow keys,
- optional **column sort** (clicking a sortable header cycles asc → desc → off).

Focus the table with Tab, move with the arrows; `q` quits (via `useInput`).

## Run

```bash
pnpm --filter @uniview/tui-table-demo dev
pnpm --filter @uniview/tui-table-demo test
```

The same `<Table>` API is available identically from `@uniview/tui-solid`.
