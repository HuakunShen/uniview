# @uniview/tui-content-demo

An AI-assistant-style terminal UI built on the Uniview content-rendering layer.
Streams a Markdown reply (headings, lists, inline styles, a fenced code block)
token-by-token like an LLM, then shows a proposed change as a syntax-highlighted
unified diff.

```bash
pnpm --filter @uniview/tui-content-demo dev
```

- `q` / `Ctrl-C` — quit

Everything is rendered through the structured styled-text model
(`@uniview/tui-content` → `@uniview/tui-core`) — never raw ANSI strings — and
authored with the React components from `@uniview/tui-react`
(`<StreamingMarkdown>`, `<Diff>`). Run in a pipe (non-TTY) and it renders the
whole message once and exits, which is how the render is verified in CI.
