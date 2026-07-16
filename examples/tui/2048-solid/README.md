# @uniview/tui-2048-solid

**2048 in the terminal, authored in Solid — with the real trained AI.**

The AI here is not a heuristic. It is an n-tuple network (5 patterns, 8-way
dihedral symmetry, ~84 MB of trained weights) driving an expectimax search over
afterstates — the same agent as the web app it was ported from. At depth 2 it
reaches the 4096 tile.

```bash
pnpm --filter @uniview/tui-2048-solid dev
```

| key | |
|---|---|
| `↑ ↓ ← →` / `h j k l` | move |
| `a` | toggle AI auto-play |
| `s` | one AI move |
| `+` / `-` | search depth (1–4) |
| `n` | new game |
| `q` / `Ctrl-C` | quit |

## The weights are not in this repo

They are ~84 MB, so `model/` is gitignored. **The game runs without them** — it
is fully playable by hand, the AI panel just reads `no model — human play`, and
the AI test suites skip.

To enable AI mode, drop the exported model into `model/`:

```
model/
  manifest.json
  golden.json        # V(board) reference values for these exact weights
  lut0_0.bin lut1_0.bin lut2_0.bin
  lut3_0.bin lut3_1.bin lut3_2.bin
  lut4_0.bin lut4_1.bin lut4_2.bin
```

Or point at them elsewhere:

```bash
UNIVIEW_2048_MODEL_DIR=/path/to/model pnpm --filter @uniview/tui-2048-solid dev
```

## Layout

```
src/
  vendor/     engine + AI, vendored verbatim from the training repo (pure, no DOM)
              board.ts · patterns.ts · universal.ts · model.ts · expectimax.ts
  ai/
    loader.ts     reads the sharded LUTs off disk; returns null when absent
    controller.ts auto-play state (available / running / depth / step)
  game.ts     the game controller — engine + signals, no UI, injectable RNG
  board.tsx   the grid, in the classic 2048 palette
  app.tsx     board + score + score-curve sparkline + AI panel
  keys.ts     input mapping (kept separate so it is testable without a terminal)
```

`src/vendor/` currently sits close to upstream (only an import path changed), which
makes it cheap to re-sync a fix from the training repo. That is a convenience, not
a rule — change it freely if the game needs it. The golden tests below are what
actually keeps it honest.

## Why it is trustworthy

The port is verified against the reference implementation, not eyeballed:

- **Engine** — replays all 204 golden boards × 4 moves (816 cases) from the
  Python reference; `after`, `reward` and `changed` all match.
- **Value function** — reproduces the reference `V(board)` on every golden board
  across all six grid shapes (4×4, 5×5, 4×5, 5×4, 3×4, 6×6), max diff < 1e-3.
  One model really does serve every shape.
- **It reaches 2048.** Not a claim — a test: at the depth the app ships with, a
  seeded game is played out through the real game controller and must end with
  `game.won() === true`. Depth 2 goes on to 4096.

The value-parity golden lives in `model/`, not in this repo, because it
describes the exact weights sitting beside it.

```bash
pnpm --filter @uniview/tui-2048-solid test
```

## What it demonstrates for uniview

Everything on screen is a `@uniview/tui-solid` component: `Panel`, `Box`, `Text`,
`StatusBar`, and the score curve is the same `Sparkline` the charts demo uses —
no bespoke rendering. The tiles are plain colored `Box`es, so no new render
primitive was needed for a game.

State is signals; the app mounts once and never re-renders by hand.
