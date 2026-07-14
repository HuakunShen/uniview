# @uniview/git-workspace-plugin

A flagship Uniview plugin that demonstrates the core thesis — **one plugin,
shared logic, one automation contract** — with a small Git workspace UI:
a branch/status header, a Refresh button, and a per-file Stage button.

- [`src/model.ts`](src/model.ts) — a framework-agnostic `GitWorkspaceModel`
  (files/status, refresh/stage/unstage/commit, subscribe). The same model can
  back a TUI, Web, or native view.
- [`src/view.tsx`](src/view.tsx) — a keyboard-first React **TUI view** in JSX
  (`<Box>`/`<Text>`), driven only by the model.
- [`src/main.tsx`](src/main.tsx) — the runnable terminal entry.
- [`tests/`](tests) — a **semantic contract test**: the automation session
  drives "Refresh → Stage README.md" by `role`/`name` (not coordinates), so the
  same script works across surfaces.

```bash
pnpm --filter @uniview/git-workspace-plugin dev     # run in a terminal
pnpm --filter @uniview/git-workspace-plugin test    # contract tests
```

Keys: `r` refresh · `Tab` move focus · `Enter` activate · `q` / `Ctrl-C` quit.
