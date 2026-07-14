export interface SourceFile {
  name: string;
  lang: string;
  code: string;
}

export const MESSAGE = `# uniview · assistant

I can render **Markdown**, syntax-highlighted **code** and **diffs** in the
terminal as a structured styled-text model — never raw ANSI strings.

## This demo
- **Chat** — this streaming reply, scrollable
- **Code** — a file browser with highlighted preview
- **Diff** — a reviewable unified diff

Try it:
- \`1\` \`2\` \`3\` or click the tabs to switch pages
- **Ctrl-K** opens the command palette
- **mouse wheel** or **↑ ↓ / PgUp PgDn** scrolls
- hover the sidebar and palette — items highlight under the pointer

\`\`\`ts
// everything below flows through one pipeline
content -> parser -> styled-text model -> cells
\`\`\`

> One plugin, shared logic, one automation contract. The same tree renders
> to a terminal, a DOM mirror, or an SVG snapshot.

Scroll down to read more, or press Ctrl-K to jump around.

### Why structured, not ANSI?
Because tokens keep their boundaries all the way to the cell buffer, the
layout knows where every word is: selection, wrapping, hit-testing and
streaming all keep working. An ANSI string throws that away.

### Keyboard + mouse
Hover moves through the host as onMouseEnter / onMouseLeave; the wheel is an
onWheel routed to the scrollable under the pointer; clicks bubble like DOM.
`;

export const FILES: SourceFile[] = [
  {
    name: "greet.ts",
    lang: "typescript",
    code: `export interface Greeter {
  greet(name: string): string
}

// A tiny greeter used across every surface.
export function createGreeter(prefix = "hello"): Greeter {
  return {
    greet(name) {
      if (!name) throw new Error("name required")
      return \`\${prefix} \${name}\`
    },
  }
}

const g = createGreeter()
console.log(g.greet("world"))
`,
  },
  {
    name: "config.json",
    lang: "json",
    code: `{
  "name": "uniview",
  "version": "0.1.0",
  "surfaces": ["terminal", "dom", "svg"],
  "features": { "markdown": true, "diff": true, "highlight": true },
  "maxWidth": 80
}
`,
  },
  {
    name: "server.py",
    lang: "python",
    code: `import asyncio


async def handle(reader, writer):
    data = await reader.read(100)
    message = data.decode()
    # echo it back, upper-cased
    writer.write(message.upper().encode())
    await writer.drain()
    writer.close()


async def main():
    server = await asyncio.start_server(handle, "127.0.0.1", 8888)
    async with server:
        await server.serve_forever()


asyncio.run(main())
`,
  },
  {
    name: "lib.rs",
    lang: "rust",
    code: `pub struct Counter {
    value: u64,
}

impl Counter {
    pub fn new() -> Self {
        Counter { value: 0 }
    }

    /// Increment and return the new value.
    pub fn tick(&mut self) -> u64 {
        self.value += 1;
        self.value
    }
}
`,
  },
];

export const DIFF = `--- a/src/app.ts
+++ b/src/app.ts
@@ -4,9 +4,13 @@ import { load } from "./config"
 export function main() {
   const cfg = load()
-  if (!cfg) return
-  const server = start(cfg)
-  server.listen()
+  if (!cfg) {
+    throw new Error("missing config")
+  }
+  const server = start(cfg)
+  server.on("error", (e) => log.error(e))
+  server.listen(cfg.port)
+  log.info("listening on", cfg.port)
 }
@@ -20,4 +24,4 @@ function start(cfg: Config) {
   return createServer(cfg)
 }
-export const VERSION = "0.1.0"
+export const VERSION = "0.2.0"
`;
