# @uniview/tui-csv-demo

`less` for CSV — a virtualized terminal **CSV pager** built on `<Table>`,
modelled on ratatui [`csvlens`](https://github.com/YS-L/csvlens).

```bash
pnpm --filter @uniview/tui-csv-demo dev                 # bundled city sample
pnpm --filter @uniview/tui-csv-demo dev -- data.csv     # view a real file
```

Keys: `↑`/`↓` `PgUp`/`PgDn` move · `←`/`→` pick the sort column (marked `▸`) ·
`s` cycle its sort (`▲`/`▼`/off) · `/` regex find, then `n`/`N` next / prev
match · `&` regex row filter · `Esc` clear find/filter · `q` or `Ctrl-C` quit.

## How it works

The grid is the framework `<Table>`, reused nearly as-is: **row virtualization**
(only the visible window is built, over any number of rows), **column layout**
(fixed / flex / min widths, per-column alignment), and a controlled row cursor.
A `<Scrollbar>` shows position. Everything else is app code on top:

- `src/csv.ts` — a dependency-free **CSV parser** (quoted fields, escaped `""`,
  CRLF, ragged rows) and a **natural comparator** (`item2` before `item10`),
  the same split `csvlens` draws between its reader and `natural_cmp`.
- **Sort** — app-side `filter → sort`, so the Table renders the final order and
  the cursor indexes it directly. Numeric columns sort numerically, text columns
  naturally; the header shows `▲`/`▼` on the active column.
- **Find** (`/`) — a regex compiled case-insensitively (invalid patterns fall
  back to a literal substring match); `n`/`N` jump the cursor between matches.
- **Filter** (`&`) — keep only rows where some cell matches the regex.

The find/filter prompt is handled inline in `useInput` (append / backspace /
Enter / Esc) rather than a focused `<TextInput>`, keeping input single-sourced in
the app — the same app-owned-input model the other multi-pane demos use.

## What phase 1 deliberately leaves out

Per the research doc, this viewer stops where the framework would need new
capability. `csvlens`'s deeper features map to four real `<Table>` gaps, left for
a future framework pass:

1. **Horizontal column scroll** — no column-axis offset yet (only vertical).
2. **Column freezing** — no sticky-left columns / freeze separator.
3. **Cell-level selection** — the cursor is a full row; the selection machine is 1-D.
4. **In-cell wrapping** — cells clip to one line; the virtual window assumes
   uniform row height. (Per-cell match highlighting needs `richtext` in cells too.)

Because those are missing, the current-column cursor and sort arrows live in the
**header text**, and find jumps the cursor rather than highlighting the matched
substring. Large-file streaming + a background sparse index (csvlens's other
half) is bridge-plugin territory — a Node/Bun plugin reads and indexes the file
off disk and streams row windows to this same UI.
