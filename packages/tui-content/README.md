# @uniview/tui-content

Content rendering for the Uniview TUI: **Markdown**, **syntax-highlighted code**,
and **diffs** — as a structured styled-text model, never raw ANSI strings.

Content → parser → styled-text model → paintable `RenderNode` → terminal cells.
Because tokens keep their boundaries all the way to the cell buffer, layout,
selection and streaming all keep working (unlike `highlight → ANSI string`).

## API

```ts
import {
  highlightToLines, // code → StyledLine[] (scope-classified spans)
  renderCode,       // code → RenderNode (+ optional line numbers)
  renderMarkdown,   // markdown → RenderNode (headings/lists/quotes/tables/code)
  renderDiff,       // unified diff → RenderNode (gutters, signs, bands)
  parseUnifiedDiff, // unified diff → { files, hunks, lines }
  wrapStyledSpans,  // style-preserving, wide-char-aware word wrap
  splitStableMarkdown, // streaming: completed blocks vs in-progress tail
  detectLanguage,   // filename → highlight.js language id
} from "@uniview/tui-content";
```

Syntax highlighting uses [`lowlight`](https://github.com/wooorm/lowlight)
(highlight.js, pure-JS, no wasm/native) so it runs in any runtime — Web Worker,
Node, Deno, Bun. Markdown parsing uses [`marked`](https://marked.js.org). Themes
are semantic (`keyword`, `string`, `comment`, …) via `@uniview/tui-core`'s
`SyntaxTheme`, so colors are swappable.

For React authoring (`<Markdown>`, `<Code>`, `<Diff>`, `<StreamingMarkdown>`),
see `@uniview/tui-react`. For a runnable demo, see
`examples/tui/content-demo`.
