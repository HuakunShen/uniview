import { useState } from "react";
import { useColorScheme } from "@uniview/react-runtime";
import { Input } from "@uniview/example-plugin-api";

/**
 * What the renderer can do, shown rather than described: variants resolved
 * natively, a real scroll view, a real command palette driven by the keyboard.
 *
 * None of it re-renders on hover, and none of it streams keystrokes to the
 * plugin — which is the difference between a renderer that survives a network
 * between the plugin and the window, and one that does not.
 */
export function Showcase({
  chrome,
  note,
  log,
}: {
  chrome: string;
  note: (line: string) => void;
  log: string[];
}) {
  const scheme = useColorScheme();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

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
    <div className="flex-col w-full gap-5 pt-7 px-8 pb-6">
      <div className="flex-col gap-1">
        <p className="text-2xl font-semibold text-foreground">
          The shell, in React
        </p>
        <p className="text-sm text-muted-foreground">
          The menu bar, the window chrome and the sidebar are all this plugin's
          tree.
        </p>
      </div>

      <div className="flex-col gap-2 p-4 rounded-lg bg-card border border-border">
        <p className="text-base text-foreground">{chrome}</p>
        {/* This is what useColorScheme() is for: a decision only the plugin can
            make. The colors themselves don't need it — `bg-card` is resolved
            natively, per appearance, with no re-render. */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 aspect-square rounded-full ${
              scheme === "dark" ? "bg-violet-400" : "bg-amber-500"
            }`}
          />
          <p className="text-xs text-muted-foreground">
            useColorScheme() says {scheme}
          </p>
        </div>
      </div>

      {/* `hover:` and `dark:` never reach the plugin — no RPC fires when the
          pointer moves over this, and nothing re-renders. Both styles ride in the
          IR and the native view picks. */}
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
          this paragraph clamped to two lines no matter how long it runs.
        </p>
      </div>

      {/* A real NSScrollView: 40 rows in a 160pt box. */}
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

      {/* Keyboard, on the declare-interest model: the field says which keys it
          wants INSTEAD of their editing behaviour, so ArrowDown moves the
          selection rather than the caret — and every other key still types,
          deletes and navigates natively, with no RPC at all. */}
      <div className="flex-col gap-2 p-4 rounded-lg bg-card border border-border">
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

      <div className="flex-col gap-1">
        {log.map((line, i) => (
          <p key={i} className="text-xs text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
