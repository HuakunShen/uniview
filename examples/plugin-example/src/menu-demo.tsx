import { useState } from "react";
import {
  Button,
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
  const [count, setCount] = useState(0);
  const [title, setTitle] = useState("Uniview Desktop");
  const [vibrancy, setVibrancy] = useState<Vibrancy>("under-window");
  const [titleBarStyle, setTitleBarStyle] = useState<"default" | "hidden" | "hiddenInset">("hidden");
  const [insetLights, setInsetLights] = useState(true);
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">("system");
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 5));

  return (
    <div className="p-6 space-y-5">
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
              const next = title === "Uniview Desktop" ? "Renamed by React" : "Uniview Desktop";
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

      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-zinc-100">The shell, in React</h2>
        <p className="text-sm text-zinc-400">
          The menu bar and the window chrome are both this component's tree.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-zinc-800/60 border border-zinc-700 space-y-2">
        <p className="text-lg text-zinc-100">
          vibrancy: {vibrancy} · titlebar: {titleBarStyle}
        </p>
        <p className="text-xs text-zinc-500">
          Count is {count} · appearance is {appearance} · window is "{title}"
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          title="Next vibrancy"
          variant="primary"
          className="flex-1"
          onClick={() => {
            const next = VIBRANCIES[(VIBRANCIES.indexOf(vibrancy) + 1) % VIBRANCIES.length];
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

      <div className="space-y-1">
        {log.map((line, i) => (
          <p key={i} className="text-xs text-zinc-500">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
