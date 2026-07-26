# Rebuilding Uniview, one runnable step at a time

Uniview lets you write a plugin in **React or Solid** and have it render in
**Svelte, Vue, React, a terminal, or native AppKit** — while the plugin itself
runs on the **main thread, in a Web Worker, or in another process entirely**.

That is three independent fan-outs over one small contract. Reading the finished
code does not show you why the contract has the shape it does. This curriculum
rebuilds it: sixteen steps, each a miniature you can run, each ending with links
to the real implementation it was distilled from.

```
                 ┌── React   (react-reconciler HostConfig)
  ① authoring ───┤                                          ──→  UINode + Mutation
                 └── Solid   (universal renderer, no VDOM)        (the whole contract)
                                                                         │
                 ┌── Svelte / Vue / React   (web)                        │
  ② host     ────┼── Terminal               (layout, diff, paint)  ←─────┤
                 └── AppKit / Swift         (native, no JS)              │
                                                                         │
                 ┌── main thread     (no serialization at all)           │
  ③ runtime  ────┼── Web Worker      (kkrpc + structured clone)    ←─────┘
                 └── WebSocket       (another process, another machine)
```

## Running a step

Everything runs from this directory. `learn/` installs standalone — it does not
depend on the rest of the workspace being built.

```bash
cd learn
pnpm install --ignore-workspace
pnpm tsx steps/01-protocol/main.ts
```

## The curriculum

Each step stands alone and runs on its own; adjacent steps are meant to be
diffed against each other.

### A. The contract

| # | Step | What you learn |
|---|------|----------------|
| 01 | `01-protocol` | `UINode` + six `Mutation` kinds — the entire contract between every layer |
| 02 | `02-mutable-tree` | Applying mutations on the host side, the operation every host must implement |

### B. ① Authoring frameworks — what a custom renderer really is

| # | Step | What you learn |
|---|------|----------------|
| 03 | `03-what-is-a-custom-renderer` | React's reconciler/renderer split, and the minimum `HostConfig` that satisfies it |
| 04 | `04-serializing-the-tree` | Live host instances → a JSON-safe `UINode`, and how a function prop becomes a `HandlerId` |
| 05 | `05-incremental-mutations` | From "send the whole tree" to "send what changed", and why the first one is fatal |
| 06 | `06-solid-renderer` | Solid's universal renderer: fine-grained, no VDOM, **identical output** |

### C. ② Hosts — one tree, many screens

| # | Step | What you learn |
|---|------|----------------|
| 07 | `07-host-contract` | What a new host must implement, and what it must never assume |
| 08 | `08-recursive-host` | The algorithm every web adapter embodies: recurse, transform props, bind handlers |
| 09 | `09-vue-and-react-hosts` | That same algorithm inside two real frameworks — what is shared, what is adapter-specific |
| 10 | `10-native-host` | A host in a language with no JS runtime, and what the protocol must therefore guarantee |
| 11 | `11-terminal-host` | The same tree as cells in a grid: layout, frame diff, paint |

### D. ③ Runtimes — one plugin, many places to run it

| # | Step | What you learn |
|---|------|----------------|
| 12 | `12-main-thread` | The controller seam, with zero serialization — the baseline to compare against |
| 13 | `13-worker` | Crossing a structured-clone boundary, and why a function prop becomes a `HandlerId` |
| 14 | `14-websocket` | The plugin in another process, over a socket |
| 15 | `15-events-and-environment` | Callbacks coming back, and why hover / scroll / dark-mode must never round-trip |

### E. Style

| # | Step | What you learn |
|---|------|----------------|
| 16 | `16-style-ir` | Semantic tokens resolved by the host, and why the renderer may not invent a color |

## How this was built

See [`RULES.md`](./RULES.md) for the contract every step follows. The one rule
that matters most: **a step is not done until its example has actually been run
and its real output pasted into the doc.**
