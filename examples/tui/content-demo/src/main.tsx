import { useEffect, useState, type ReactElement } from "react";
import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { Box, createTuiReactRoot, Diff, StreamingMarkdown, Text } from "@uniview/tui-react";

/**
 * AI-assistant-style content demo. Streams a Markdown message token-by-token
 * (headings, lists, inline styles, a fenced code block) exactly like an LLM
 * reply, then shows a proposed code change as a syntax-highlighted diff — the
 * plan's target UX (§9/§12), rendered through the structured styled-text model.
 *
 *   pnpm --filter @uniview/tui-content-demo dev
 *
 *   q / Ctrl-C   quit
 */
const MESSAGE = `# Uniview TUI content

I render **Markdown**, syntax-highlighted code and diffs as a structured
styled-text model — never raw ANSI strings, so layout, selection and
streaming all keep token boundaries.

## What works
- headings, paragraphs (word-wrapped), lists and quotes
- inline \`code\`, _emphasis_, **strong** and [links](http://uniview)
- fenced code blocks, highlighted by scope:

\`\`\`ts
export function greet(name: string): string {
  // one plugin, many surfaces
  return \`hello \${name}\`
}
\`\`\`

> Streamed like a chat reply — completed blocks are reused, only the
> in-progress tail is re-parsed.
`;

const DIFF = `--- a/src/app.ts
+++ b/src/app.ts
@@ -6,5 +6,6 @@ export function main() {
   const cfg = load()
-  if (!cfg) return
+  if (!cfg) {
+    throw new Error("missing config")
+  }
   run(cfg)
 }`;

const columns = process.stdout.columns ?? 80;
const rows = process.stdout.rows ?? 48;
const WIDTH = Math.min(76, columns);
const CONTENT_WIDTH = WIDTH - 2;

/** Headless (piped) runs render everything at once and exit, for verification. */
const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";

function App(): ReactElement {
  const [shown, setShown] = useState(ONCE ? MESSAGE.length : 0);
  const done = shown >= MESSAGE.length;

  useEffect(() => {
    if (ONCE) {
      const t = setTimeout(quit, 250);
      return () => clearTimeout(t);
    }
    if (done) return;
    const t = setTimeout(() => setShown((n) => Math.min(MESSAGE.length, n + 3)), 16);
    return () => clearTimeout(t);
  }, [shown, done]);

  return (
    <Box flexDirection="column" gap={1} padding={1}>
      <Text color="cyan" bold>
        assistant
      </Text>
      <StreamingMarkdown content={MESSAGE.slice(0, shown)} width={CONTENT_WIDTH} />
      {done ? (
        <Text color="gray" dim>
          proposed change · src/app.ts
        </Text>
      ) : null}
      {done ? <Diff patch={DIFF} language="typescript" /> : null}
      <Text color="gray" dim>
        q quit
      </Text>
    </Box>
  );
}

const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (chunk) => process.stdout.write(chunk), styles });
const root = createTuiReactRoot({ surface, styles, size: { width: WIDTH, height: rows } });

let started = false;
function quit(): void {
  root.destroy();
  if (started) driver.stop();
  process.exit(0);
}

const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  onEvent: (event) => {
    if (event.type === "resize") {
      root.host.renderer.resize({ width: Math.min(76, event.width), height: event.height });
      return;
    }
    if (
      (event.type === "text" && event.text === "q") ||
      (event.type === "key" && event.key === "c" && event.ctrl)
    ) {
      quit();
    }
  },
});

if (!ONCE) {
  driver.start();
  started = true;
  process.stdin.on?.("end", quit);
}
root.render(<App />);
