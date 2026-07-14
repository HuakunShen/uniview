import { useState } from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuSeparator,
  Window,
} from "@uniview/example-plugin-api";

/**
 * The application shell — menu bar and window chrome — written in React and
 * running in Node. None of it is Swift.
 *
 * `<Menu>` and `<Window>` are *surfaces*: native, but not views. They take up no
 * space, so they sit in the tree next to the buttons and re-render from state
 * like anything else — change `title` and the real window's title changes.
 *
 * `onSelect` needed no new protocol: it's an ordinary handler prop, so it
 * crosses the bridge as a handler id and comes back through `executeHandler`,
 * exactly like `onClick`.
 *
 * `role` items are the exception, and have to be. A plugin cannot implement
 * Copy: Copy isn't an action a program performs, it's a message sent down the
 * responder chain to whatever view has focus. A role hands the item to that
 * native action — so the focused text field handles it, the plugin never sees
 * it, and the item greys itself out when nothing on screen can handle it.
 */
export default function MenuDemo() {
  const [count, setCount] = useState(0);
  const [verbose, setVerbose] = useState(false);
  const [title, setTitle] = useState("Uniview Desktop");
  const [insetLights, setInsetLights] = useState(true);
  const [titlebar, setTitlebar] = useState<"transparent" | "default">("transparent");
  const [log, setLog] = useState<string[]>([]);

  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 5));

  return (
    <div className="p-6 space-y-5">
      {/* The real NSWindow's chrome. Nothing here creates a window — it
          configures the one the app already has, like RN's <StatusBar>. */}
      <Window
        title={title}
        titlebar={titlebar}
        transparentBackground
        trafficLights={insetLights ? { x: 22, y: 22 } : undefined}
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

        {/* From here down it's all the plugin's own — React state, React handlers. */}
        <MenuItem title="Counter">
          <MenuItem
            title={`Increment (now ${count})`}
            shortcut="cmd+i"
            onSelect={() => {
              setCount(count + 1);
              note(`⌘I → increment to ${count + 1}`);
            }}
          />
          <MenuItem
            title="Reset"
            shortcut="cmd+shift+r"
            enabled={count > 0}
            onSelect={() => {
              setCount(0);
              note("⌘⇧R → reset");
            }}
          />
          <MenuSeparator />
          <MenuItem
            title="Verbose logging"
            checked={verbose}
            onSelect={() => {
              setVerbose(!verbose);
              note(`verbose → ${!verbose}`);
            }}
          />
        </MenuItem>

        {/* A menu, written in React, that drives a window, written in React. */}
        <MenuItem title="Window">
          <MenuItem
            title="Rename Window…"
            shortcut="cmd+shift+n"
            onSelect={() => {
              const next = title === "Uniview Desktop" ? "Renamed by React" : "Uniview Desktop";
              setTitle(next);
              note(`window title → "${next}"`);
            }}
          />
          <MenuItem
            title="Inset traffic lights"
            checked={insetLights}
            onSelect={() => {
              setInsetLights(!insetLights);
              note(`traffic lights → ${!insetLights ? "inset" : "default corner"}`);
            }}
          />
          <MenuItem
            title="Show titlebar"
            checked={titlebar === "default"}
            onSelect={() => {
              const next = titlebar === "default" ? "transparent" : "default";
              setTitlebar(next);
              note(`titlebar → ${next}`);
            }}
          />
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
        <p className="text-lg text-zinc-100">Count: {count}</p>
        <p className="text-xs text-zinc-500">
          Window title is "{title}" — traffic lights are{" "}
          {insetLights ? "inset" : "at the OS default corner"}.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          title="Increment"
          variant="primary"
          className="flex-1"
          onClick={() => {
            setCount(count + 1);
            note(`button → increment to ${count + 1}`);
          }}
        />
        <Button
          title="Move traffic lights"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setInsetLights(!insetLights);
            note(`traffic lights → ${!insetLights ? "inset" : "default corner"}`);
          }}
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
