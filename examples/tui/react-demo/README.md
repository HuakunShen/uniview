# @uniview/tui-react-demo

A minimal **React counter rendered to the terminal** via `@uniview/tui-react` —
the smallest end-to-end example of authoring TUI in JSX with the `<Box>` /
`<Text>` components:

```tsx
<Box flexDirection="column" border="rounded">
  <Text color="cyan" bold>React on tui-core</Text>
  <Box onClick={() => setCount((c) => c + 1)} backgroundColor="blue">
    <Text color="white">Increment</Text>
  </Box>
</Box>
```

The React tree flows through the real pipeline: React → UINode → host → cells,
with click / Tab+Enter routed back by the host input router.

```bash
pnpm --filter @uniview/tui-react-demo dev
```

Click `[ Increment ]` or focus it with `Tab` and press `Enter`; `q` / `Ctrl-C`
quits. For a full multi-page app see `examples/tui/opencode-demo`.
