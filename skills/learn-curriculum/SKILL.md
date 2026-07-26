---
name: learn-curriculum
description: Keep the learn/ curriculum honest as Uniview changes. Use after landing a change that alters the protocol, adds or removes a host adapter or runtime, changes how the reconcilers serialize, or invalidates something a step asserts about the real code — or when asked to "add a step", "update learn", or "document this for the curriculum". Do NOT use for ordinary feature work that only adds more of a pattern an existing step already teaches.
---

# Keeping the learn/ curriculum current

`learn/` rebuilds Uniview in sixteen runnable steps. Each step is a miniature a
reader can run, and each doc quotes the real source it was distilled from — so
every step is a claim about this codebase that can go stale.

Read [`learn/README.md`](../../learn/README.md) for the curriculum and
[`learn/RULES.md`](../../learn/RULES.md) for the contract every step follows.
`learn/DECISIONS.md` records why the curriculum is shaped the way it is, and what
was deliberately left out.

**The one rule that matters: a step is not done until its example has actually
been run and its real output pasted into the doc.** Everything else here protects
that.

## When a change should touch learn/

The curriculum is organized around three fan-outs — authoring frameworks, hosts,
runtimes. A change matters to it when it moves one of those, or falsifies a claim:

| Change | What it means for learn/ |
|---|---|
| A `Mutation` kind, or `UINode`'s shape | Steps 01 and 02, then everything downstream — this is the contract |
| A new host adapter (a sixth platform) | Probably a new step in Stage C; check whether step 07's contract still describes it |
| A new runtime/transport | A new step in Stage D, and steps 12–14's boundary table gains a row |
| Serialization or handler-id format | Steps 04 and 05; the id format appears in almost every later step's output |
| A step's cited file moves or its API changes | A doc fix, not a new step |
| A "this codebase does not do X" claim becomes false | A doc fix. These rot silently — they are the most common staleness |

Ordinary feature work — another component, another prop, another example app —
does not belong in learn/. The curriculum teaches the architecture, not the
surface area.

## Fixing a stale step

1. Read the step's doc and the source it quotes.
2. Fix the claim, snippet, or link.
3. If the example changed, **re-run it** and re-paste the real output. A code
   change invalidates the doc's "Run it" section until you do.
4. `cd learn && pnpm test` — runs all sixteen steps end to end.

## Adding a step

1. Take the next unused two-digit number and pick which stage it belongs to.
   Do not renumber existing steps; the numbers appear in every doc's "What
   changed since step N" and in cross-references throughout.
2. Find 2–4 real source anchors showing the technique in actual use.
3. Write the step per `RULES.md` — including the two sections that are easiest to
   skip and most valuable: **"Why this approach, and not the obvious
   alternative"** and **"What this step leaves out"**.
4. Reconstruction order matters: a step must build on the previous step's actual
   code, not on an idea of it. Read the previous step before writing.
5. Add a row to `README.md`'s table and check the "What changed since" chain
   still reads continuously.

## Verify

```bash
cd learn && pnpm test          # all sixteen steps must run clean
cd learn && pnpm check-types   # strict, with noUnusedLocals
```

`learn` is a workspace member, so root `pnpm test` covers it in CI too.

## Pitfalls seen when this was built

- **Invented output.** The single easiest rule to skip under time pressure, and
  the one that makes a curriculum untrustworthy. Every "Run it" block must come
  from a real run.
- **Trusting a report over a re-run.** During the original build one step was
  reported as type-clean and was not. Re-run rather than believe.
- **Cross-thread and cross-process steps are load-bearing.** Steps 13 and 14 run
  a real worker thread and a real forked process. They break in ways the other
  fourteen cannot — a worker does not inherit tsx's loader, so those files need
  explicit file extensions in their imports. Do not "tidy" those away.
- **The docs quote real line numbers.** Moving code in `packages/` can silently
  make a quoted snippet wrong. `learn/`'s tests do not catch that; only reading
  does.
