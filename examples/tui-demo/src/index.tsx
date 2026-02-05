import { Box, Button, Input, Text, createTuiRoot } from "@uniview/tui-renderer";
import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);
  const [value, setValue] = useState("");

  return (
    <Box padding={1} gap={1}>
      <Text bold>Standalone TUI Demo</Text>
      <Text>Count: {count}</Text>
      <Button onPress={() => setCount((current: number) => current + 1)}>
        Increment
      </Button>
      <Input value={value} onChange={setValue} placeholder="Type here" />
      <Text dim>Input value: {value || "(empty)"}</Text>
    </Box>
  );
}

const root = createTuiRoot();
root.render(<App />);
