import { createTuiApp } from "@uniview/tui-core";
import { createInitialState, reduce, view, viewportHeight } from "./model";

const app = createTuiApp({ input: process.stdin, output: process.stdout });
let state = createInitialState();

function paint(): void {
  app.render(view(state, app.size));
}

function quit(): void {
  app.destroy();
  process.exit(0);
}

paint();
app.onInput((event) => {
  if (
    (event.type === "key" && event.ctrl && event.key === "c") ||
    (event.type === "text" && event.text === "q")
  ) {
    quit();
    return;
  }

  const next = reduce(state, event, viewportHeight(app.size));
  if (next !== state) {
    state = next;
    paint();
  }
});

process.stdin.on?.("end", quit);
