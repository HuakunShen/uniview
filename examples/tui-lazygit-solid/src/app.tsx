import { createSignal, type Accessor, type JSX, type Setter } from "solid-js";
import type { TuiInputEvent } from "@uniview/tui-core";
import { Box, List, Panel, StatusBar, listCounter, nextFocus } from "@uniview/tui-solid";

export interface AppHost {
  quit: () => void;
}

/**
 * State is signals, not a plain object. The React twin keeps a mutable `AppState`
 * and re-invokes `root.render(...)` after every key; here a `setFocused(…)` is
 * enough — Solid's reactivity updates only the panels that actually changed.
 * There is no `rerender` anywhere in this demo, which is the whole point of it.
 */
export interface AppState {
  focused: Accessor<number>; // 0..5 → Status, Files, Branches, Commits, Stash, Log
  setFocused: Setter<number>;
  branch: Accessor<number>;
  setBranch: Setter<number>;
  commit: Accessor<number>;
  setCommit: Setter<number>;
}

const BRANCHES = [
  "feat/tui",
  "main",
  "codex-validation-e2e-audit",
  "debug",
  "fix-react",
  "vue-runtime",
  "backup",
];
const COMMITS = [
  "9297a6f fix(tui-core): geometric hit-testing",
  "8973cc9 fix(tui-core): Escape handling",
  "3408146 fix(tui-core): text bg",
  "f6a117b docs: READMEs",
  "0e1aba2 refactor(examples): JSX",
];
const STATUS_KEYS = [
  { label: "Checkout", keyHint: "<space>" },
  { label: "New branch", keyHint: "n" },
  { label: "Delete", keyHint: "d" },
  { label: "Rebase", keyHint: "r" },
  { label: "Keybindings", keyHint: "?" },
];

export function createAppState(): AppState {
  const [focused, setFocused] = createSignal(2);
  const [branch, setBranch] = createSignal(0);
  const [commit, setCommit] = createSignal(0);
  return { focused, setFocused, branch, setBranch, commit, setCommit };
}

/**
 * Returns true if the event was handled (do not forward it to the Solid tree).
 * Digits/letters arrive as `text` events; named keys (Tab/Arrow) as `key` events.
 */
export function handleKey(state: AppState, host: AppHost, event: TuiInputEvent): boolean {
  if (event.type === "key" && event.ctrl && event.key === "c") {
    host.quit();
    return true;
  }
  const focusKey = event.type === "text" ? event.text : event.type === "key" ? event.key : "";
  const shift = event.type === "key" ? event.shift : false;
  const nf = nextFocus(state.focused(), 6, focusKey, shift);
  if (nf !== null) {
    state.setFocused(nf);
    return true;
  }
  if (event.type === "key" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    const d = event.key === "ArrowDown" ? 1 : -1;
    const step = (max: number, cur: number): number => Math.max(0, Math.min(max, cur + d));
    if (state.focused() === 2) state.setBranch((c) => step(BRANCHES.length - 1, c));
    else if (state.focused() === 3) state.setCommit((c) => step(COMMITS.length - 1, c));
    return true;
  }
  return false;
}

export function App(props: { state: AppState }): JSX.Element {
  const state = props.state;
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" width={34}>
          <Panel title="[1]-Status" focused={state.focused() === 0} height={3}>
            <Box>uniview → feat/tui</Box>
          </Panel>
          <Panel
            title="[2]-Files"
            focused={state.focused() === 1}
            footer="0 of 0"
            footerAlign="right"
            flexGrow={1}
          />
          <Panel
            title="[3]-Local branches"
            focused={state.focused() === 2}
            footer={listCounter(state.branch(), BRANCHES.length)}
            footerAlign="right"
            flexGrow={2}
          >
            <List
              items={BRANCHES}
              selectedIndex={state.branch()}
              onSelect={state.setBranch}
              width="100%"
            />
          </Panel>
          <Panel
            title="[4]-Commits"
            focused={state.focused() === 3}
            footer={listCounter(state.commit(), COMMITS.length)}
            footerAlign="right"
            flexGrow={2}
          >
            <List
              items={COMMITS}
              selectedIndex={state.commit()}
              onSelect={state.setCommit}
              width="100%"
            />
          </Panel>
          <Panel
            title="[5]-Stash"
            focused={state.focused() === 4}
            footer="1 of 9"
            footerAlign="right"
            height={3}
          >
            <Box>5M On main: WIP on main</Box>
          </Panel>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Panel title="[0]-Log" focused={state.focused() === 5} flexGrow={1}>
            <Box>{`commit ${COMMITS[state.commit()]}`}</Box>
          </Panel>
        </Box>
      </Box>
      <StatusBar items={STATUS_KEYS} height={1} />
    </Box>
  );
}
