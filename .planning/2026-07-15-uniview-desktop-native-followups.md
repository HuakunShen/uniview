# Uniview Desktop (AppKit) — follow-ups & known gaps

**As of:** 2026-07-15, branch `claude/native-desktop-framework-bb6e3d`
**Scope of this note:** the **native macOS (AppKit)** host only. Windows/HarmonyOS
are future platforms; the Svelte/Vue/React **web** hosts are explicitly out of
scope for this line of work (see "Deliberately not doing" below).

This is an honest inventory of what is *not* finished, written down so it isn't
carried in anyone's head. Nothing here blocks the current PR — the framework
renders a real, fully-interactive native app end to end. These are the edges.

---

## 1. One unexplained bug (do not forget this one)

**A one-time blank window on host reconnect.** Once, after restarting the app
while the plugin stayed running, the whole window came up empty — a full-screen
transparent window over the desktop, no tree drawn. Adding a log proved the tree
*did* arrive (`updateTree` fired with a non-nil tree), and it never reproduced
across three subsequent restarts. **Root cause unknown.** It was masked before
this branch because the sidebar was native and always painted *something*; now
the whole window is the plugin's tree, so a missed first render is a blank app.

- Hypothesis worth checking first: a race between the plugin's first
  `updateTree` and the host view being on-screen / sized (container size 0 at
  the moment the first commit lands → everything lays out to zero).
- Do **not** invent a fix. It reproduced once; instrument (`updateTree` arrival,
  container size at first commit, `rootView` frame) and wait for it to happen
  again.

---

## 2. Variants that resolve in TS but are dead on the native side

The resolver already emits these; the host just doesn't act on them yet.

- **`disabled:`** — `resolveStyle` produces `variants.disabled`, but
  `StyleStateView.styleState` only ever inserts `dark`/`light`, `hover`,
  `active`, `focus`. `disabled` is never in the state set, so `disabled:bg-…`
  never applies. (The `disabled` *prop* still works — buttons/inputs go
  `isEnabled = false` — it's only the `disabled:` *variant* that's inert.)
  Fix: thread the node's `disabled` prop into `styleState`.
- **`focus:` on text fields** — `styleState` derives focus from
  `window.firstResponder === self`. For a `StyledFieldView`, the first responder
  is the field editor (an `NSTextView`), not the view, so `focus:` on a field
  won't light up. Plain focusable boxes are fine. Fix: treat "my field editor is
  first responder" as focus for field-backed views.

---

## 3. Text input correctness (the classic two-way-binding traps)

- **IME / dead keys — no guard.** `HandlerTextField` has no `hasMarkedText()`
  check. If the host writes `value` into the field while the user is mid-
  composition (pinyin, accents), it will clobber the marked text. Rule to
  implement: never call `setValueFromHost` while `currentEditor()?.hasMarkedText()`
  is true; re-apply once composition ends.
- **Controlled-input echo race.** `setValueFromHost` guards on `value !=
  stringValue`, which stops the simplest feedback loop, but a fast typist can
  still out-run a round trip through the plugin. Worth a proper "pending local
  edit" reconciliation, RN-style, if controlled inputs get heavy use.

---

## 4. Protocol / lifecycle loose ends

- **TS never sends `CommitBatch.revision`.** The plugin renders batches with no
  revision; the host re-stamps a monotonic revision locally (`apply()` in
  `Shell.swift`). It works because there's one plugin per host, but it means the
  host's staleness check can't actually catch an out-of-order batch from the
  plugin — it trusts arrival order. If multiplexing or reconnect-replay ever
  matters, the plugin should own the revision.
- **No imperative one-shots.** Everything is declarative tree + events. There's
  no RN-TurboModule-style `invoke(method, args) -> result` for one-off native
  calls (open a file panel, read the clipboard, show an NSAlert). Several real
  desktop features will want this rather than modelling a modal as tree state.

---

## 5. Desktop interactions not built yet

These are the "it doesn't feel like a real desktop app until…" items. Each is
likely to surface a missing primitive, the way keyboard and click did.

- **Right-click / context menus.** `NSMenu` popped at the cursor. Model it like
  `<Menu>` (a surface), or a `contextMenu` prop carrying a small menu tree.
- **Drag and drop** — both within the window (reorder a list) and from outside
  (drop a file onto a drop zone). Needs `NSDraggingSource`/`Destination` wired to
  declared drop types, on the same declare-interest principle as keys.
- **List multi-select / range-select** (shift-click, ⌘-click). Today selection
  is whatever the plugin models in state; there's no native selection affordance.
- **Scroll-to / programmatic focus beyond `autoFocus`.** No way for the plugin
  to say "scroll this row into view" or "focus that field now" after mount.

---

## 6. Smaller cleanups (low stakes)

- **Sidebar uses arbitrary hex for its hover/selected pills**
  (`bg-[#8080801f]`, `hover:bg-[#80808014]`) because there was no semantic token
  for "a faint neutral fill". Consider a `bg-fill`/`bg-fill-secondary` token that
  resolves to the right dynamic `NSColor`, so the sidebar stops hard-coding
  translucent greys.
- **`className={\`text-[${BRAND}]\`}` template interpolation.** Works, but
  building Tailwind classes by string interpolation is fragile (a real Tailwind
  build would purge these). Fine for the demo; if the plugin API grows, prefer
  passing colors via `style={{ color: BRAND }}`.
- **Sibling reorder in the Mounter** still does a full remove/re-add of the
  desired list when order differs (only the "one view moved" fast path for focus
  was addressed). Not a correctness issue; could be a real LIS-style minimal-move
  reorder if a big list ever reorders every frame.
- **Accessibility.** The native views carry almost no `NSAccessibility` labels /
  roles. A real product ships VoiceOver support; the renderer should map ARIA-ish
  props (or infer roles) onto the AppKit accessibility protocol.
- **Window state.** Frame autosave is set, but there's no multi-window story and
  no per-plugin window restoration.

---

## 7. Deliberately NOT doing (recorded so it isn't re-proposed)

- **Teaching the web hosts about `<Menu>` / `<Window>`.** Menus and window chrome
  are *native* concepts. The Svelte/Vue/React web demos render `<Menu>` as
  `Unknown: Menu`, and that is **correct** — those surfaces are meaningless in a
  browser. The web hosts are not part of the native-desktop line and should not
  grow menu-bar emulation. (If we ever want the web hosts to stop showing the red
  `Unknown:` placeholder, the right move is for them to *ignore* unknown surfaces,
  not to implement them.)

---

## Suggested order when this line resumes

1. **Desktop interactions (§5)** — context menu first, then drag-drop. Highest
   "feels like a real app" payoff, self-contained, and each will pressure-test
   the primitive set.
2. **Input correctness (§3)** — the IME guard is small and prevents real data
   loss for CJK users; worth doing before any serious form work.
3. **Second native platform (Windows WinUI / HarmonyOS)** — the actual thesis of
   the project (one tree + one Style IR, renderer rewritten per platform). Big
   enough to deserve its own design round, not a follow-up bullet.
