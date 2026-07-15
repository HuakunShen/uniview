import { useState } from "react";
import {
  Menu,
  MenuItem,
  MenuSeparator,
  Window,
  type Vibrancy,
} from "@uniview/example-plugin-api";
import SimpleDemo from "./simple-demo";
import { Sidebar, type Section } from "./shell/Sidebar";
import { Showcase } from "./shell/Showcase";
import { AboutPage, ComponentsPage, FormsPage, HomePage } from "./shell/pages";

/**
 * The whole application — menu bar, window chrome, sidebar and content — as one
 * React tree, running in Node, rendered as real AppKit views.
 *
 * There is no Swift left in this app's UI. The demo app that hosts this is now a
 * window, a backdrop and a bridge connection; it does not know that a sidebar
 * exists, and `UniviewAppKit` has never heard of one. Which section is showing is
 * `useState` — not host state, not a native controller, not an RPC.
 *
 * `<Menu>` and `<Window>` are *surfaces*: native, but not views. They take up no
 * space and no layout box, so they sit in the tree next to everything else and
 * re-render from state like anything else.
 */
const VIBRANCIES: Vibrancy[] = [
  "under-window",
  "under-page",
  "content",
  "window",
  "sidebar",
  "header",
  "titlebar",
  "menu",
  "popover",
  "hud",
  "sheet",
  "selection",
  "fullscreen-ui",
  "tooltip",
];

const SECTIONS: Section[] = [
  { id: "shell", title: "React Shell", symbol: "menubar.rectangle" },
  {
    id: "live",
    title: "Live React",
    symbol: "bolt",
    symbolSelected: "bolt.fill",
  },
  { id: "home", title: "Home", symbol: "house", symbolSelected: "house.fill" },
  {
    id: "components",
    title: "Components",
    symbol: "square.grid.2x2",
    symbolSelected: "square.grid.2x2.fill",
  },
  { id: "forms", title: "Forms", symbol: "square.and.pencil" },
  {
    id: "about",
    title: "About",
    symbol: "info.circle",
    symbolSelected: "info.circle.fill",
  },
];

export default function AppShell() {
  const [section, setSection] = useState("shell");
  const [title, setTitle] = useState("Uniview Desktop");
  const [vibrancy, setVibrancy] = useState<Vibrancy>("under-window");
  const [titleBarStyle, setTitleBarStyle] = useState<
    "default" | "hidden" | "hiddenInset"
  >("hidden");
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">(
    "system",
  );
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 5));

  return (
    // ⌘K is a key equivalent: it fires wherever focus happens to be, including
    // from inside the palette's search field. The main menu still gets first
    // refusal, so a plugin cannot shadow ⌘Q.
    <div
      className="flex w-full h-full"
      keyDownEvents={["cmd+k"]}
      onKeyDown={() => note("⌘K — caught by the tree")}
    >
      {/* Nothing here creates a window; it configures the one the app already
          owns, the way RN's <StatusBar> does. The traffic lights are nudged into
          the sidebar panel's top padding — the sidebar wraps them. */}
      <Window
        title={title}
        titleBarStyle={titleBarStyle}
        vibrancy={vibrancy}
        transparent
        appearance={appearance}
        alwaysOnTop={alwaysOnTop}
        trafficLightPosition={
          titleBarStyle === "default" ? undefined : { x: 20, y: 18 }
        }
        movableByWindowBackground
        minWidth={880}
        minHeight={600}
      />

      <Menu>
        <MenuItem title="Uniview Desktop">
          <MenuItem title="About Uniview Desktop" role="about" />
          <MenuSeparator />
          <MenuItem title="Hide Uniview Desktop" shortcut="cmd+h" role="hide" />
          <MenuSeparator />
          <MenuItem title="Quit Uniview Desktop" shortcut="cmd+q" role="quit" />
        </MenuItem>

        <MenuItem title="Edit">
          <MenuItem title="Undo" shortcut="cmd+z" role="undo" />
          <MenuItem title="Redo" shortcut="cmd+shift+z" role="redo" />
          <MenuSeparator />
          <MenuItem title="Cut" shortcut="cmd+x" role="cut" />
          <MenuItem title="Copy" shortcut="cmd+c" role="copy" />
          <MenuItem title="Paste" shortcut="cmd+v" role="paste" />
          <MenuItem title="Select All" shortcut="cmd+a" role="selectAll" />
        </MenuItem>

        {/* The sidebar's sections, as menu items — the same `useState` behind
            both, because both are the plugin's. */}
        <MenuItem title="View">
          {SECTIONS.map((entry) => (
            <MenuItem
              key={entry.id}
              title={entry.title}
              checked={section === entry.id}
              onSelect={() => setSection(entry.id)}
            />
          ))}
        </MenuItem>

        {/* Every macOS material, selectable — the checkmark is React state. */}
        <MenuItem title="Vibrancy">
          {VIBRANCIES.map((material) => (
            <MenuItem
              key={material}
              title={material}
              checked={vibrancy === material}
              onSelect={() => {
                setVibrancy(material);
                note(`vibrancy → ${material}`);
              }}
            />
          ))}
        </MenuItem>

        <MenuItem title="Window">
          <MenuItem
            title="Rename Window…"
            shortcut="cmd+shift+n"
            onSelect={() => {
              const next =
                title === "Uniview Desktop"
                  ? "Renamed by React"
                  : "Uniview Desktop";
              setTitle(next);
              note(`title → "${next}"`);
            }}
          />
          <MenuSeparator />
          <MenuItem
            title="Show titlebar"
            checked={titleBarStyle === "default"}
            onSelect={() => {
              const next = titleBarStyle === "default" ? "hidden" : "default";
              setTitleBarStyle(next);
              note(`titleBarStyle → ${next}`);
            }}
          />
          <MenuItem
            title="Always on top"
            checked={alwaysOnTop}
            onSelect={() => {
              setAlwaysOnTop(!alwaysOnTop);
              note(`alwaysOnTop → ${!alwaysOnTop}`);
            }}
          />
          {/* Force this window light or dark regardless of the system setting —
              something a web `prefers-color-scheme` can never do. */}
          {(["system", "light", "dark"] as const).map((mode) => (
            <MenuItem
              key={mode}
              title={`Appearance: ${mode}`}
              checked={appearance === mode}
              onSelect={() => {
                setAppearance(mode);
                note(`appearance → ${mode}`);
              }}
            />
          ))}
          <MenuSeparator />
          <MenuItem title="Minimize" shortcut="cmd+m" role="minimize" />
          <MenuItem title="Close" shortcut="cmd+w" role="close" />
        </MenuItem>
      </Menu>

      <Sidebar sections={SECTIONS} active={section} onSelect={setSection} />

      {/* The content pane. Scrollable, because a page can be longer than a
          window — which is a thing this framework only learned last week. */}
      <div className="flex-1 h-full overflow-scroll">
        {section === "shell" && (
          <Showcase
            chrome={`vibrancy: ${vibrancy} · titlebar: ${titleBarStyle} · appearance: ${appearance}`}
            note={note}
            log={log}
          />
        )}
        {section === "live" && <SimpleDemo />}
        {section === "home" && <HomePage />}
        {section === "components" && <ComponentsPage />}
        {section === "forms" && <FormsPage />}
        {section === "about" && <AboutPage />}
      </div>
    </div>
  );
}
