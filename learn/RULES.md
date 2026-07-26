# Rules for adding or updating a step

This file is the contract every step follows. Read it in full before writing
anything. It exists so that independently written steps read as one curriculum
instead of sixteen unrelated tutorials.

## What one step is

One step = exactly these deliverables, numbered `NN` (two digits, matching the
table in `README.md`):

- `steps/NN-slug/main.ts` — a runnable, self-contained entry point.
  `pnpm tsx steps/NN-slug/main.ts` (run from `learn/`) must finish on its own —
  no external service, no real network beyond loopback, no waiting on a human —
  and print output that *demonstrates* the concept, not just that it type-checks.
  Supporting modules may live beside it in the same directory.
- `docs/NN-slug.md` — the doc, in the fixed structure below.

The slug must be identical between the directory and the doc filename, and must
match the slug already used for that number in `README.md`. Never invent a new
number.

## This is reconstruction, not reference

You are rebuilding a miniature of Uniview, step by step, so a reader can watch
the design assemble itself. Therefore:

- **Do not import `@uniview/*`.** `learn/` deliberately does not depend on the
  workspace packages. Each step reimplements what it needs, small enough to read
  in one sitting. The real packages are what you *quote and link to*, not what
  you call.
- **Your step must contain the previous step's ideas, not import its files.**
  Each `steps/NN-slug/` directory stands alone and runs on its own. Copy forward
  what you need from step NN-1 and then add your delta. Yes, this duplicates
  code across directories — that is the point: a reader can diff two adjacent
  steps and see exactly what changed.
- **Read the previous step's actual code before writing yours.** Its type names,
  its function names, and its output format are the baseline you extend. Do not
  invent a parallel vocabulary.

## Doc structure (`docs/NN-slug.md`)

Every doc has these sections, in this order. Do not skip one; write
"N/A — because X" if it truly does not apply.

```markdown
# NN. <Title, matching README.md's table>

## Why

2-4 sentences: the problem this step solves, and *specifically* why Uniview
needs it. Not "this is a common pattern" — the actual failure mode it avoids
here. Ground it in something real: a source comment, `CLAUDE.md`'s prime
directive, a constraint the architecture is built around.

## Why this approach, and not the obvious alternative

Name at least one concrete alternative and say what it specifically cannot do,
or what it costs to get right by hand. Vague ("this is cleaner") is
unacceptable; concrete ("sending the whole tree means a 200-node UI re-serializes
200 nodes on every keystroke, across a structured-clone boundary") is. If
Uniview's own source or `CLAUDE.md` explains the choice, quote it.

## What changed since step NN-1

The delta from the previous step, precisely. A reader who did the previous step
must be able to see exactly what this step adds. Omit for step 01.

## How Uniview really does it

1-3 snippets (<=20 lines each), **copied verbatim** from the real repository —
never paraphrased, never retyped from memory — each followed by a link in this
exact form:

`[packages/protocol/src/tree.ts:126](../../packages/protocol/src/tree.ts#L126)`

(Two `../` because `docs/` sits under `learn/`, which sits under the repo root.)
For a range, link the first line and give the range in prose.

## What this step leaves out

What the real implementation does that your teaching version does not — error
handling, edge cases, performance work, platform quirks — each with a link to
the production file. Without this section a reader finishes believing they
understand something they have only seen a toy version of. This section is
mandatory and must be specific.

## Trade-offs

3-5 bullets, concrete. What it costs and what it buys back.

## Run it

    pnpm tsx steps/NN-slug/main.ts

...followed by **real, captured** output. Run it yourself before writing this.
Never invent plausible-looking output. Trim long output to a representative
5-20 lines and say that you trimmed it.

## Sources

Every repository file referenced anywhere in the doc, as links.
```

## Example code (`steps/NN-slug/main.ts`)

- Heavily commented and teaching-oriented. Assume a competent TypeScript
  programmer who has never seen this codebase.
- Runs to completion and prints something that shows the idea working. Printing
  a tree, a mutation log, or a rendered frame beats printing "ok".
- Mirrors the real project's naming. A node type here should be called `UINode`
  and a mutation `AppendChild`, matching `packages/protocol`, not a textbook
  `MyNode`/`AddOp`.
- Type-checks under the repo's strict settings.

## Shared files — do not edit

`learn/package.json`, `learn/tsconfig.json`, `learn/README.md`, `learn/RULES.md`
and `learn/steps/00-scaffold-probe/` are shared scaffolding. Every dependency
the whole curriculum needs is already pinned there.

Do not add a dependency or edit these to solve one step's problem. If you
genuinely believe something is missing, **say so in your report instead of
editing** — other steps are being written in parallel and a silent edit can
break a sibling.

## Verify only your own step

Run `pnpm tsx steps/NN-slug/main.ts` for *your* step. A repo-wide check may fail
because another step is mid-write; that is not yours to fix or report as broken.
The orchestrator owns final verification.

## The real source is the authority

If your brief paraphrases a signature, a type, or a flow and the real code
disagrees, **the real code wins** — and say so in your report. Code against the
*pinned* version of a dependency (check `learn/package.json` and the installed
`node_modules`), never against the API you remember. `react-reconciler@0.33` in
particular requires host-config methods whose absence fails at runtime, not at
type-check time — see `steps/00-scaffold-probe/main.ts`.

## Language

Doc prose and code comments are English.
