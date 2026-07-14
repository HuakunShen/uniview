import { useState } from "react";
import { useColorScheme } from "@uniview/react-runtime";
import {
  Button,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Window,
  type Vibrancy,
} from "@uniview/example-plugin-api";

/**
 * The application shell — menu bar AND window chrome — written in React and
 * running in Node. None of it is Swift.
 *
 * `<Menu>` and `<Window>` are *surfaces*: native, but not views. They take up no
 * space, so they sit in the tree next to the buttons and re-render from state
 * like anything else.
 *
 * The `<Window>` props are Electron's `BrowserWindow` names, because that's the
 * vocabulary desktop authors already have. `vibrancy` is the full non-deprecated
 * `NSVisualEffectView` set — the same fourteen materials Electron and Tauri
 * expose. They're semantic, not visual: `sidebar` isn't "a bit of grey", it's
 * "whatever the OS currently thinks a sidebar looks like".
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

export default function MenuDemo() {
  // The host tells us what it resolved — the WINDOW's scheme, not the system's,
  // so this flips when the Appearance menu below does. You don't need it to make
  // the colors right (see below); you need it to *decide* things.
  const scheme = useColorScheme();
  const [count, setCount] = useState(0);
  const [title, setTitle] = useState("Uniview Desktop");
  const [vibrancy, setVibrancy] = useState<Vibrancy>("under-window");
  const [titleBarStyle, setTitleBarStyle] = useState<
    "default" | "hidden" | "hiddenInset"
  >("hidden");
  const [insetLights, setInsetLights] = useState(true);
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">(
    "system",
  );
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 5));

  const COMMANDS = [
    "Open Window",
    "Toggle Vibrancy",
    "Copy Selection",
    "Rename Window",
    "Quit Uniview",
  ];
  const matches = COMMANDS.filter((c) =>
    c.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    // A MODIFIED chord is a key equivalent: ⌘K fires wherever focus happens to
    // be — including from inside the search field below, which is exactly what a
    // palette shortcut has to do. The main menu still gets first refusal, so a
    // plugin cannot shadow ⌘Q.
    <div
      className="p-6 space-y-5"
      keyDownEvents={["cmd+k"]}
      onKeyDown={(event) => note(`⌘K — caught by the tree (key: ${event.key})`)}
    >
      {/* The real NSWindow. Nothing here creates a window — it configures the
          one the app already has, the way RN's <StatusBar> does. */}
      <Window
        title={title}
        titleBarStyle={titleBarStyle}
        vibrancy={vibrancy}
        transparent
        appearance={appearance}
        alwaysOnTop={alwaysOnTop}
        trafficLightPosition={insetLights ? { x: 22, y: 22 } : undefined}
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
            title="Inset traffic lights"
            checked={insetLights}
            enabled={titleBarStyle !== "default"}
            onSelect={() => {
              setInsetLights(!insetLights);
              note(`traffic lights → ${!insetLights ? "inset" : "OS corner"}`);
            }}
          />
          <MenuSeparator />
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

      {/* Not a single hardcoded color below. `text-foreground`, `bg-card` and
          `border-border` reach the native host as NAMES and become dynamic
          NSColors — so this reads correctly in light AND dark, and it re-colors
          the instant you flip the Appearance menu, with no re-render at all. The
          old version hardcoded `text-zinc-100`, which was invisible on white. */}
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-foreground">
          The shell, in React
        </h2>
        <p className="text-sm text-muted-foreground">
          The menu bar and the window chrome are both this component's tree.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-card border border-border space-y-2">
        <p className="text-lg text-foreground">
          vibrancy: {vibrancy} · titlebar: {titleBarStyle}
        </p>
        <p className="text-xs text-muted-foreground">
          Count is {count} · appearance is {appearance} · window is "{title}"
        </p>
        {/* …and THIS is what useColorScheme() is for: a decision only the plugin
            can make. The dot is a literal palette color, chosen by the plugin. */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              scheme === "dark" ? "bg-violet-400" : "bg-amber-500"
            }`}
          />
          <p className="text-xs text-muted-foreground">
            useColorScheme() says {scheme}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          title="Next vibrancy"
          variant="primary"
          className="flex-1"
          onClick={() => {
            const next =
              VIBRANCIES[
                (VIBRANCIES.indexOf(vibrancy) + 1) % VIBRANCIES.length
              ];
            setVibrancy(next);
            note(`vibrancy → ${next}`);
          }}
        />
        <Button
          title="Increment"
          variant="secondary"
          className="flex-1"
          onClick={() => setCount(count + 1)}
        />
      </div>

      {/* The gaps that just landed: an absolutely-placed badge (its offsets used
          to be un-expressible), a real elevation from the theme's scale, an
          arbitrary size, a clamp, and an aspect ratio. */}
      {/* `hover:` and `dark:` never reach the plugin — no RPC fires when you move
          the mouse over this, and nothing re-renders. Both styles are in the IR
          and the native view picks. Hover it; flip Appearance in the Window menu. */}
      <div className="flex gap-2">
        <div className="flex-1 p-3 rounded-lg border border-border bg-card hover:bg-emerald-500 dark:hover:bg-violet-500">
          <p className="text-sm text-foreground text-center">
            hover me — no RPC
          </p>
        </div>
        <div className="flex-1 p-3 rounded-lg border border-border bg-amber-100 dark:bg-zinc-800">
          <p className="text-sm text-foreground text-center">dark: vs light</p>
        </div>
      </div>

      <div className="relative p-4 rounded-lg bg-card border border-border shadow-lg">
        <div className="absolute -top-2 -right-2 w-[22px] aspect-square rounded-full bg-emerald-500" />
        <p className="text-sm text-foreground leading-relaxed line-clamp-2">
          A badge pinned to the corner with -top-2 -right-2, a 22px square from
          an arbitrary value, shadow-lg from the theme's elevation scale, and
          this paragraph clamped to two lines no matter how long it runs — every
          one of which was impossible to say an hour ago.
        </p>
      </div>

      {/* A real NSScrollView. 40 rows in a 160pt box — the content is taller than
          the window, which until now simply had nowhere to go. */}
      <div className="h-[160px] overflow-scroll rounded-lg border border-border bg-card">
        <div className="flex-col p-2 gap-1">
          {Array.from({ length: 40 }, (_, i) => (
            <div
              key={i}
              className="flex items-center px-3 h-8 rounded-md hover:bg-emerald-500 dark:hover:bg-violet-500"
            >
              <p className="text-sm text-foreground">
                Row {i + 1} — scroll me, hover me
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard, on the declare-interest model. The field says which keys it
          wants INSTEAD of their editing behaviour — so ArrowDown moves the
          selection rather than the caret, while every other key still types,
          deletes and moves through the text natively. Nothing else is streamed to
          the plugin: press a letter and no RPC fires at all. */}
      <div className="p-4 rounded-lg bg-card border border-border space-y-2">
        <p className="text-xs text-muted-foreground">
          Type to filter · ↑ ↓ to select · ⏎ to run · Esc to clear
        </p>
        <Input
          placeholder="Search commands…"
          value={query}
          onChange={(next) => {
            setQuery(next);
            setSelected(0);
          }}
          keyDownEvents={["ArrowDown", "ArrowUp", "Enter", "Escape"]}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown")
              setSelected((i) => Math.min(i + 1, matches.length - 1));
            if (event.key === "ArrowUp") setSelected((i) => Math.max(i - 1, 0));
            if (event.key === "Enter")
              note(`ran "${matches[selected] ?? "—"}"`);
            if (event.key === "Escape") {
              setQuery("");
              setSelected(0);
            }
          }}
        />
        <div className="flex-col gap-1">
          {matches.map((command, i) => (
            <div
              key={command}
              className={`flex items-center px-3 h-8 rounded-md ${
                i === selected ? "bg-accent" : "hover:bg-muted"
              }`}
            >
              <p
                className={`text-sm ${
                  i === selected ? "text-primary-foreground" : "text-foreground"
                }`}
              >
                {command}
              </p>
            </div>
          ))}
          {matches.length === 0 && (
            <p className="text-sm text-muted-foreground px-3">
              No command matches "{query}"
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        {log.map((line, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
