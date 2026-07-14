import { useState } from "react";
import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { Box, createTuiReactRoot, Text } from "@uniview/tui-react";

/**
 * A React counter running in the terminal via @uniview/tui-react — authored in
 * plain JSX with the ink-style <Box>/<Text> components.
 *
 *   pnpm --filter @uniview/tui-react-demo dev
 *   click [ Increment ] or focus it with Tab and press Enter; q / Ctrl-C quits.
 */
function App() {
  const [count, setCount] = useState(0);
  return (
    <Box flexDirection="column" padding={1} border="rounded" width={40}>
      <Text color="cyan" bold>
        React on tui-core
      </Text>
      <Text> </Text>
      <Text bold>{`Count: ${count}`}</Text>
      <Text> </Text>
      <Box
        onClick={() => setCount((c) => c + 1)}
        backgroundColor="blue"
        padding={{ left: 1, right: 1 }}
      >
        <Text color="white">Increment</Text>
      </Box>
      <Text color="gray" dim>
        Tab+Enter or click · q quits
      </Text>
    </Box>
  );
}

const styles = new StyleTable();
const surface = new AnsiCellSurface({
  write: (chunk) => process.stdout.write(chunk),
  styles,
});
const root = createTuiReactRoot({ surface, styles, size: { width: 40, height: 12 } });

function quit(): void {
  root.destroy();
  driver.stop();
  process.exit(0);
}

const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  onEvent: (event) => {
    if (event.type === "resize") {
      root.host.renderer.resize({ width: event.width, height: event.height });
      return;
    }
    if (
      (event.type === "text" && event.text === "q") ||
      (event.type === "key" && event.key === "c" && event.ctrl)
    ) {
      quit();
      return;
    }
    root.dispatchInput(event);
  },
});

driver.start();
root.render(<App />);

process.stdin.on?.("end", quit);
