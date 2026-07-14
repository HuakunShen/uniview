import { createElement, type ReactElement } from "react";
import type { TuiInputEvent } from "@uniview/tui-core";
import { Box, List, Panel, StatusBar, listCounter, nextFocus } from "@uniview/tui-react";

export interface AppHost {
  rerender: () => void;
  quit: () => void;
}

export interface AppState {
  focused: number; // 0..5 → Status, Files, Branches, Commits, Stash, Log
  branch: number;
  commit: number;
}

const BRANCHES = ["feat/tui", "main", "codex-validation-e2e-audit", "debug", "fix-react", "vue-runtime", "backup"];
const COMMITS = ["9297a6f fix(tui-core): geometric hit-testing", "8973cc9 fix(tui-core): Escape handling", "3408146 fix(tui-core): text bg", "f6a117b docs: READMEs", "0e1aba2 refactor(examples): JSX"];
const STATUS_KEYS = [
  { label: "Checkout", keyHint: "<space>" },
  { label: "New branch", keyHint: "n" },
  { label: "Delete", keyHint: "d" },
  { label: "Rebase", keyHint: "r" },
  { label: "Keybindings", keyHint: "?" },
];

export function createState(): AppState {
  return { focused: 2, branch: 0, commit: 0 };
}

/**
 * Returns true if the event was handled (do not forward to the React tree).
 * Digits/letters arrive as `text` events; named keys (Tab/Arrow) as `key` events.
 */
export function handleKey(state: AppState, host: AppHost, event: TuiInputEvent): boolean {
  if (event.type === "key" && event.ctrl && event.key === "c") {
    host.quit();
    return true;
  }
  const focusKey = event.type === "text" ? event.text : event.type === "key" ? event.key : "";
  const shift = event.type === "key" ? event.shift : false;
  const nf = nextFocus(state.focused, 6, focusKey, shift);
  if (nf !== null) {
    state.focused = nf;
    host.rerender();
    return true;
  }
  if (event.type === "key" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    const d = event.key === "ArrowDown" ? 1 : -1;
    const step = (max: number, cur: number) => Math.max(0, Math.min(max, cur + d));
    if (state.focused === 2) state.branch = step(BRANCHES.length - 1, state.branch);
    else if (state.focused === 3) state.commit = step(COMMITS.length - 1, state.commit);
    host.rerender();
    return true;
  }
  return false;
}

export function App({ state }: { state: AppState; host: AppHost }): ReactElement {
  const left = createElement(
    Box,
    { flexDirection: "column", width: 34 },
    createElement(Panel, { title: "[1]-Status", focused: state.focused === 0, height: 3 }, createElement(Box, null, "uniview → feat/tui")),
    createElement(Panel, { title: "[2]-Files", focused: state.focused === 1, footer: "0 of 0", footerAlign: "right", flexGrow: 1 }),
    createElement(
      Panel,
      { title: "[3]-Local branches", focused: state.focused === 2, footer: listCounter(state.branch, BRANCHES.length), footerAlign: "right", flexGrow: 2 },
      createElement(List<string>, { items: BRANCHES, selectedIndex: state.branch, onSelect: () => {}, width: "100%" }),
    ),
    createElement(
      Panel,
      { title: "[4]-Commits", focused: state.focused === 3, footer: listCounter(state.commit, COMMITS.length), footerAlign: "right", flexGrow: 2 },
      createElement(List<string>, { items: COMMITS, selectedIndex: state.commit, onSelect: () => {}, width: "100%" }),
    ),
    createElement(Panel, { title: "[5]-Stash", focused: state.focused === 4, footer: "1 of 9", footerAlign: "right", height: 3 }, createElement(Box, null, "5M On main: WIP on main")),
  );
  const right = createElement(
    Box,
    { flexDirection: "column", flexGrow: 1 },
    createElement(Panel, { title: "[0]-Log", focused: state.focused === 5, flexGrow: 1 }, createElement(Box, null, `commit ${COMMITS[state.commit]}`)),
  );
  return createElement(
    Box,
    { flexDirection: "column", width: "100%", height: "100%" },
    createElement(Box, { flexDirection: "row", flexGrow: 1 }, left, right),
    createElement(StatusBar, { items: STATUS_KEYS, height: 1 }),
  );
}
