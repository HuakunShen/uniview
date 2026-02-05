# @uniview/tui-renderer

Standalone React reconciler that renders to the terminal.

## Install

```bash
pnpm add @uniview/tui-renderer react
```

## Usage

```tsx
import { createTuiRoot, Box, Text, Button, Input } from "@uniview/tui-renderer";
import { createElement, useState } from "react";

function App() {
  const [count, setCount] = useState(0);
  const [value, setValue] = useState("");

  return (
    <Box padding={1} gap={1}>
      <Text bold>Counter</Text>
      <Text>Count: {count}</Text>
      <Button onPress={() => setCount((c) => c + 1)}>Increment</Button>
      <Input value={value} onChange={setValue} placeholder="Type here" />
    </Box>
  );
}

const root = createTuiRoot();
root.render(createElement(App));
```

## Notes

- Fixed layout MVP (no Yoga) to keep it simple.
- Keyboard-only input (Tab to focus, Enter/Space to activate).
