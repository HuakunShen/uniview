import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  syntaxThemes,
  type RenderNode,
  type RgbColor,
  type TuiInputEvent,
} from "@uniview/tui-core";
import { renderCode, renderDiff, renderMarkdown } from "@uniview/tui-content";
import {
  Box,
  clampScroll,
  CommandPalette,
  Hoverable,
  ScrollView,
  Text,
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

// --- logic (pure of the view) ----------------------------------------------

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

// --- view (JSX) -------------------------------------------------------------

interface AppApi {
  state: State;
  host: AppHost;
}
const AppContext = createContext<AppApi | null>(null);
function useApp(): AppApi {
  const api = useContext(AppContext);
  if (!api) throw new Error("AppContext missing");
  return api;
}

function Tab({ index, label }: { index: number; label: string }): ReactElement {
  const { state, host } = useApp();
  const active = state.page === index;
  return (
    <Hoverable
      onClick={() => {
        state.page = index;
        host.rerender();
      }}
    >
      {(hovered) => (
        <Box
          padding={{ left: 1, right: 1 }}
          backgroundColor={active ? ACTIVE_BG : hovered ? HOVER_BG : undefined}
        >
          <Text bold={active} color={active || hovered ? "white" : "gray"}>
            {`${index + 1} ${label}`}
          </Text>
        </Box>
      )}
    </Hoverable>
  );
}

function Header(): ReactElement {
  const { state } = useApp();
  return (
    <Box flexDirection="row" gap={1} height={1}>
      <Text bold color="cyan">
        {" uniview "}
      </Text>
      {PAGES.map((label, i) => (
        <Tab key={label} index={i} label={label} />
      ))}
      <Box flexGrow={1} />
      <Text color="gray" dim>
        {`Ctrl-K palette · ${state.themeName} `}
      </Text>
    </Box>
  );
}

function StatusBar(): ReactElement {
  const { state } = useApp();
  const hints =
    state.page === 1
      ? "1/2/3 pages · [ ] file · ↑↓ scroll · Ctrl-K palette · q quit"
      : "1/2/3 pages · ↑↓ PgUp/PgDn scroll · Ctrl-K palette · q quit";
  return (
    <Box height={1} backgroundColor={PANEL_BG}>
      <Text color="gray" dim>
        {` ${hints}`}
      </Text>
    </Box>
  );
}

function FileList(): ReactElement {
  const { state, host } = useApp();
  return (
    <Box flexDirection="column" width={16} backgroundColor={PANEL_BG} height={contentHeight(state)}>
      {FILES.map((file, i) => {
        const active = state.file === i;
        return (
          <Hoverable
            key={file.name}
            onClick={() => {
              state.file = i;
              state.scroll[1] = 0;
              host.rerender();
            }}
          >
            {(hovered) => (
              <Box width={16} backgroundColor={active ? ACTIVE_BG : hovered ? HOVER_BG : undefined}>
                <Text color={active || hovered ? "white" : undefined} bold={active}>
                  {`${active ? "▸ " : "  "}${file.name}`}
                </Text>
              </Box>
            )}
          </Hoverable>
        );
      })}
    </Box>
  );
}

function PageScroller({ width }: { width: number }): ReactElement {
  const { state, host } = useApp();
  return (
    <ScrollView
      content={pageContent(state)}
      height={contentHeight(state)}
      width={width}
      scrollTop={state.page === 0 && state.chatFollow ? Number.MAX_SAFE_INTEGER : state.scroll[state.page]}
      onScrollChange={(top) => {
        state.scroll[state.page] = top;
        if (state.page === 0) state.chatFollow = false;
        host.rerender();
      }}
    />
  );
}

function PageBody(): ReactNode {
  const { state } = useApp();
  if (state.page === 1) {
    return (
      <Box flexDirection="row" gap={1} height={contentHeight(state)}>
        <FileList />
        <PageScroller width={state.width - 17} />
      </Box>
    );
  }
  return <PageScroller width={state.width} />;
}

function Palette(): ReactNode {
  const { state, host } = useApp();
  if (!state.palette.open) return null;
  const width = Math.min(48, state.width - 6);
  return (
    <CommandPalette
      items={COMMANDS}
      query={state.palette.query}
      selectedIndex={state.palette.selected}
      top={2}
      left={Math.max(2, Math.floor((state.width - width) / 2))}
      width={width}
      onSelect={(id) => runCommand(state, host, id)}
      onHover={(i) => {
        state.palette.selected = i;
        host.rerender();
      }}
    />
  );
}

/** The whole app view for a given state + host. */
export function App({ state, host }: AppApi): ReactElement {
  return (
    <AppContext.Provider value={{ state, host }}>
      <Box flexDirection="column" width={state.width} height={state.height}>
        <Header />
        <Box flexGrow={1}>
          <PageBody />
        </Box>
        <StatusBar />
        <Palette />
      </Box>
    </AppContext.Provider>
  );
}
