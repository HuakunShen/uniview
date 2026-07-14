import { useState } from "react";
import { Button, Menu, MenuItem, MenuSeparator } from "@uniview/example-plugin-api";

/**
 * The application's menu bar, written in React and running in Node.
 *
 * Nothing here is Swift. The `<Menu>` is part of the same tree as the buttons:
 * it re-renders from state like anything else (watch the item titles and the
 * checkmark change), and `onSelect` is an ordinary handler prop — it crosses the
 * bridge as a handler id, exactly like `onClick`.
 *
 * `role` items are the exception, and they have to be. A plugin cannot implement
 * Copy: Copy isn't an action a program performs, it's a message sent to whatever
 * view has focus. A role hands the item to that native action, so the focused
 * text field handles it and the plugin never sees it — which is also why those
 * items grey themselves out when nothing on screen can handle them.
 */
export default function MenuDemo() {
  const [count, setCount] = useState(0);
  const [verbose, setVerbose] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 6));

  return (
    <div className="p-6 space-y-5">
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

        {/* Everything below is the plugin's own — React state, React handlers. */}
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
      </Menu>

      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-zinc-100">Menus in React</h2>
        <p className="text-sm text-zinc-400">
          The menu bar above is this component's tree. Press ⌘I, or use the
          Counter menu.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-zinc-800/60 border border-zinc-700 space-y-2">
        <p className="text-lg text-zinc-100">Count: {count}</p>
        <p className="text-xs text-zinc-500">
          Verbose logging is {verbose ? "on" : "off"} — the menu item's checkmark
          is React state.
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
          title="Reset"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            setCount(0);
            note("button → reset");
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
