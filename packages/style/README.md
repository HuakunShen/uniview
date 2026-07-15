# @uniview/style

A normalized style schema and a Tailwind-subset resolver. Resolution runs
**plugin-side**: the resulting `ResolvedStyle` travels on the wire, so a native
host (AppKit, WinUI, …) consumes concrete numbers and enums and never parses a
class name.

```ts
import { resolveStyle } from "@uniview/style";

resolveStyle({
  className: "flex gap-4 p-4 bg-zinc-800 rounded-lg",
  style: { alignItems: "center" }, // the object wins on conflict
});
// → { flexDirection: "row", gap: 16, paddingTop: 16, …, backgroundColor: "#27272a",
//     borderRadius: 8, alignItems: "center" }
```

`@uniview/react-renderer` calls this for every node and puts the result on the
derived `_style` prop, next to the untouched `className` / `style` the author
wrote. Web hosts keep reading those two; native hosts read `_style`. One tree,
both worlds.

## Two places this follows CSS, not the token name

- **`flex` means a row.** CSS's `display:flex` defaults to `flex-direction: row`,
  but a flex engine (Yoga) defaults to _column_. Treating `flex` as a no-op would
  silently stack every `<div className="flex gap-2">` vertically.
- **`space-y-N` / `space-x-N` become `gap`.** Tailwind implements them as margins
  on the children; on a flex engine `gap` is the equivalent, and every native
  container is a flex box. The axis distinction is lost — a `space-y` on a row
  spaces it horizontally.

A box with no flex class states no direction, and the engine's default (column)
stacks it — which is what a plain block `<div>` does in CSS.

## Supported classes

| Group      | Classes                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flex       | `flex`, `flex-row\|col[-reverse]`, `flex-wrap\|nowrap`, `flex-1`, `flex-auto`, `flex-none`, `grow[-0]`, `shrink[-0]`, `items-*`, `justify-*`, `self-*` |
| Spacing    | `gap-N`, `space-{x,y}-N`, `p{,x,y,t,r,b,l}-N`, `m{,x,y,t,r,b,l}-N`, `m{,x,y,t,r,b,l}-auto`                                                             |
| Sizing     | `{w,h,min-w,min-h,max-w,max-h}-{N \| full \| auto \| N/M \| named}` — named sizes are Tailwind's `md`/`lg`/… scale (`max-w-md` → 448)                  |
| Visual     | `bg-<color>`, `border`, `border-<n>`, `border-<color>`, `rounded[-{sm,md,lg,xl,2xl,3xl,full,N}]`, `opacity-N`, `relative`, `absolute`                  |
| Typography | `text-<size>`, `text-<color>`, `font-{normal,medium,semibold,bold}`, `text-{left,center,right}`                                                        |

`N` accepts Tailwind's fractional steps (`mt-0.5` → 2px). The spacing scale is
`N → N*4` px.

**Colors** are the full Tailwind palette (`zinc-400`, `emerald-500`) plus semantic
tokens (`foreground`, `border`, `primary`, …), which win on a name collision. The
`/alpha` suffix is folded into an 8-digit hex — `bg-emerald-500/10` →
`#10b9811a` — the form native color parsers already accept, so no host needs an
`rgba()` parser.

Unknown classes are ignored. Pass a custom `Theme` as the second argument to
override any token.
