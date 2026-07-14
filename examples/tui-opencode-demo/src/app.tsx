import { createElement as h, type ReactElement, type ReactNode } from "react";
import {
  syntaxThemes,
  type RenderNode,
  type RgbColor,
  type TuiInputEvent,
} from "@uniview/tui-core";
import { renderCode, renderDiff, renderMarkdown } from "@uniview/tui-content";
import {
  clampScroll,
  CommandPalette,
  Hoverable,
  ScrollView,
  type Command,
} from "@uniview/tui-react";
import { DIFF, FILES, MESSAGE } from "./data";

const PAGES = ["Chat", "Code", "Diff"] as const;
const HOVER_BG: RgbColor = { r: 42, g: 46, b: 64 };
const ACTIVE_BG: RgbColor = { r: 40, g: 78, b: 146 };
const PANEL_BG: RgbColor = { r: 24, g: 26, b: 38 };

export const COMMANDS: Command[] = [
  { id: "chat", label: "Go to Chat", hint: "1" },
  { id: "code", label: "Go to Code", hint: "2" },
  { id: "diff", label: "Go to Diff", hint: "3" },
  { id: "theme", label: "Toggle Theme", hint: "t" },
  { id: "top", label: "Scroll to Top", hint: "Home" },
  { id: "bottom", label: "Scroll to Bottom", hint: "End" },
  { id: "quit", label: "Quit", hint: "q" },
];

export interface State {
  width: number;
  height: number;
  page: number;
  scroll: [number, number, number];
  chatFollow: boolean;
  file: number;
  themeName: "tokyo-night" | "github-light";
  streamN: number;
  palette: { open: boolean; query: string; selected: number };
}

export function createState(width: number, height: number, streamN = 0): State {
  return {
    width,
    height,
    page: 0,
    scroll: [0, 0, 0],
    chatFollow: true,
    file: 0,
    themeName: "tokyo-night",
    streamN,
    palette: { open: false, query: "", selected: 0 },
  };
}

/** Callbacks the host (real driver, or a test) injects. */
export interface AppHost {
  rerender: () => void;
  quit: () => void;
}

const theme = (s: State) => syntaxThemes[s.themeName]!;
const contentHeight = (s: State): number => Math.max(1, s.height - 2);

/** The scrollable content node for the current page (a column of 1-row nodes). */
export function pageContent(s: State): RenderNode {
  const t = theme(s);
  if (s.page === 0) {
    return renderMarkdown(MESSAGE.slice(0, s.streamN), { width: s.width - 2, theme: t });
  }
  if (s.page === 1) {
    const file = FILES[s.file]!;
    return renderCode(file.code, { lang: file.lang, theme: t, lineNumbers: true });
  }
  return renderDiff(DIFF, { lang: "typescript", theme: t });
}

const rowCount = (s: State): number => pageContent(s).children?.length ?? 0;

function setScroll(s: State, next: number): void {
  const max = Math.max(0, rowCount(s) - contentHeight(s));
  s.scroll[s.page] = clampScroll(next, rowCount(s), contentHeight(s));
  if (s.page === 0) s.chatFollow = s.scroll[0] >= max;
}
const scrollBy = (s: State, delta: number): void => setScroll(s, s.scroll[s.page] + delta);

export function runCommand(s: State, host: AppHost, id: string): void {
  s.palette.open = false;
  switch (id) {
    case "chat":
      s.page = 0;
      break;
    case "code":
      s.page = 1;
      break;
    case "diff":
      s.page = 2;
      break;
    case "theme":
      s.themeName = s.themeName === "tokyo-night" ? "github-light" : "tokyo-night";
      break;
    case "top":
      setScroll(s, 0);
      break;
    case "bottom":
      setScroll(s, Number.MAX_SAFE_INTEGER);
      break;
    case "quit":
      host.quit();
      return;
  }
  host.rerender();
}

/** Global key handling. Returns true if the event was consumed. */
export function handleKey(s: State, host: AppHost, event: TuiInputEvent): boolean {
  if (s.palette.open) {
    if (event.type === "key" && event.key === "Escape") s.palette.open = false;
    else if (event.type === "key" && event.key === "Enter") {
      const filtered = COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(s.palette.query.toLowerCase()),
      );
      const cmd = filtered[s.palette.selected];
      if (cmd) {
        runCommand(s, host, cmd.id);
        return true;
      }
    } else if (event.type === "key" && event.key === "ArrowDown") s.palette.selected += 1;
    else if (event.type === "key" && event.key === "ArrowUp")
      s.palette.selected = Math.max(0, s.palette.selected - 1);
    else if (event.type === "key" && event.key === "Backspace") {
      s.palette.query = s.palette.query.slice(0, -1);
      s.palette.selected = 0;
    } else if (event.type === "text") {
      s.palette.query += event.text;
      s.palette.selected = 0;
    }
    host.rerender();
    return true;
  }

  if (event.type === "key" && event.key === "k" && event.ctrl) {
    s.palette = { open: true, query: "", selected: 0 };
    host.rerender();
    return true;
  }
  if (event.type === "key" && event.key === "c" && event.ctrl) {
    host.quit();
    return true;
  }
  if (event.type === "text") {
    if (event.text === "q") {
      host.quit();
      return true;
    }
    if (event.text === ":") {
      s.palette = { open: true, query: "", selected: 0 };
      host.rerender();
      return true;
    }
    if (event.text === "t") {
      runCommand(s, host, "theme");
      return true;
    }
    if (event.text >= "1" && event.text <= "3") {
      s.page = Number(event.text) - 1;
      host.rerender();
      return true;
    }
    if (s.page === 1 && (event.text === "[" || event.text === "]")) {
      s.file = (s.file + (event.text === "]" ? 1 : FILES.length - 1)) % FILES.length;
      s.scroll[1] = 0;
      host.rerender();
      return true;
    }
    if (event.text === "j") {
      scrollBy(s, 1);
      host.rerender();
      return true;
    }
    if (event.text === "k") {
      scrollBy(s, -1);
      host.rerender();
      return true;
    }
  }
  if (event.type === "key") {
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: contentHeight(s),
      PageUp: -contentHeight(s),
    };
    if (event.key in step) {
      scrollBy(s, step[event.key]!);
      host.rerender();
      return true;
    }
    if (event.key === "Home") {
      setScroll(s, 0);
      host.rerender();
      return true;
    }
    if (event.key === "End") {
      setScroll(s, Number.MAX_SAFE_INTEGER);
      host.rerender();
      return true;
    }
  }
  return false;
}

// --- view -------------------------------------------------------------------

function Tab(s: State, host: AppHost, index: number, label: string): ReactElement {
  const active = s.page === index;
  return h(Hoverable, {
    key: label,
    onClick: () => {
      s.page = index;
      host.rerender();
    },
    children: (hovered: boolean) =>
      h(
        "box",
        {
          padding: { left: 1, right: 1 },
          backgroundColor: active ? ACTIVE_BG : hovered ? HOVER_BG : undefined,
        },
        h(
          "text",
          { bold: active, color: active || hovered ? "white" : "gray" },
          `${index + 1} ${label}`,
        ),
      ),
  });
}

function Header(s: State, host: AppHost): ReactElement {
  return h(
    "box",
    { flexDirection: "row", gap: 1, height: 1 },
    h("text", { bold: true, color: "cyan" }, " uniview "),
    ...PAGES.map((label, i) => Tab(s, host, i, label)),
    h("box", { flexGrow: 1 }),
    h("text", { color: "gray", dim: true }, `Ctrl-K palette · ${s.themeName} `),
  );
}

function StatusBar(s: State): ReactElement {
  const hints =
    s.page === 1
      ? "1/2/3 pages · [ ] file · ↑↓ scroll · Ctrl-K palette · q quit"
      : "1/2/3 pages · ↑↓ PgUp/PgDn scroll · Ctrl-K palette · q quit";
  return h(
    "box",
    { height: 1, backgroundColor: PANEL_BG },
    h("text", { color: "gray", dim: true }, ` ${hints}`),
  );
}

function FileList(s: State, host: AppHost): ReactElement {
  return h(
    "box",
    { flexDirection: "column", width: 16, backgroundColor: PANEL_BG, height: contentHeight(s) },
    ...FILES.map((file, i) => {
      const active = s.file === i;
      return h(Hoverable, {
        key: file.name,
        onClick: () => {
          s.file = i;
          s.scroll[1] = 0;
          host.rerender();
        },
        children: (hovered: boolean) =>
          h(
            "box",
            { width: 16, backgroundColor: active ? ACTIVE_BG : hovered ? HOVER_BG : undefined },
            h(
              "text",
              { color: active || hovered ? "white" : undefined, bold: active },
              `${active ? "▸ " : "  "}${file.name}`,
            ),
          ),
      });
    }),
  );
}

function scroller(s: State, host: AppHost, width: number): ReactElement {
  return h(ScrollView, {
    content: pageContent(s),
    height: contentHeight(s),
    width,
    scrollTop: s.page === 0 && s.chatFollow ? Number.MAX_SAFE_INTEGER : s.scroll[s.page],
    onScrollChange: (top: number) => {
      s.scroll[s.page] = top;
      if (s.page === 0) s.chatFollow = false;
      host.rerender();
    },
  });
}

function PageBody(s: State, host: AppHost): ReactNode {
  if (s.page === 1) {
    return h(
      "box",
      { flexDirection: "row", gap: 1, height: contentHeight(s) },
      FileList(s, host),
      scroller(s, host, s.width - 17),
    );
  }
  return scroller(s, host, s.width);
}

function Palette(s: State, host: AppHost): ReactNode {
  if (!s.palette.open) return null;
  const width = Math.min(48, s.width - 6);
  return h(CommandPalette, {
    items: COMMANDS,
    query: s.palette.query,
    selectedIndex: s.palette.selected,
    top: 2,
    left: Math.max(2, Math.floor((s.width - width) / 2)),
    width,
    onSelect: (id: string) => runCommand(s, host, id),
    onHover: (i: number) => {
      s.palette.selected = i;
      host.rerender();
    },
  });
}

/** The whole app view for a given state. */
export function App(s: State, host: AppHost): ReactElement {
  return h(
    "box",
    { flexDirection: "column", width: s.width, height: s.height },
    Header(s, host),
    h("box", { flexGrow: 1 }, PageBody(s, host)),
    StatusBar(s),
    Palette(s, host),
  );
}
