import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { Box, createTuiReactRoot, Text } from "@uniview/tui-react";
import { GitWorkspaceModel } from "./model";
import { GitWorkspaceTui } from "./view";

/**
 * Runnable terminal entry for the flagship Git Workspace plugin.
 *
 *   pnpm --filter @uniview/git-workspace-plugin dev
 *
 *   r        refresh the working tree
 *   Tab      move focus between buttons
 *   Enter    activate the focused button (Refresh / Stage <file>)
 *   q / ^C   quit
 */
const model = new GitWorkspaceModel();
const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (chunk) => process.stdout.write(chunk), styles });
const root = createTuiReactRoot({ surface, styles, size: { width: 52, height: 14 } });

function App() {
  return (
    <Box flexDirection="column">
      <GitWorkspaceTui model={model} />
      <Text color="gray" dim>
        r refresh · Tab+Enter act · q quit
      </Text>
    </Box>
  );
}

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
    if (event.type === "text" && event.text === "r") {
      model.refresh();
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
