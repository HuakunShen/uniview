import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";

/**
 * The application menu bar, written in React.
 *
 * A `<Menu>` renders no view and takes up no space — put it anywhere in the
 * tree. The native host recognizes it as a *surface* (native, but not a view)
 * and builds the real menu bar from it, so the menu re-renders with your state
 * like anything else:
 *
 * ```tsx
 * <Menu>
 *   <MenuItem title="File">
 *     <MenuItem title="New" shortcut="cmd+n" onSelect={() => setDocs([...docs, blank])} />
 *     <MenuSeparator />
 *     <MenuItem title="Close" shortcut="cmd+w" role="close" />
 *   </MenuItem>
 * </Menu>
 * ```
 *
 * On a web host a `<Menu>` has no meaning and is simply ignored.
 */
export interface MenuProps {
  /** Top-level `<MenuItem>`s — each becomes a menu in the bar. */
  children?: ReactNode;
}

export function Menu({ children }: MenuProps): ReactElement {
  return createElement("Menu", null, children);
}

/**
 * A standard action the operating system already knows how to perform.
 *
 * These exist because a plugin *cannot* implement Copy. Copy is not something a
 * program does; it is a message sent to whatever view currently has focus. A
 * `role` wires the item to that native action, so a focused text field handles
 * it with the plugin never involved — and the item greys itself out when nothing
 * on screen can handle it.
 *
 * Use `onSelect` for your own commands, and `role` for these.
 */
export type MenuRole =
  | "about"
  | "hide"
  | "hideOthers"
  | "showAll"
  | "quit"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "delete"
  | "selectAll"
  | "close"
  | "minimize"
  | "zoom"
  | "front";

export interface MenuItemProps {
  title: string;
  /**
   * `"cmd+n"`, `"cmd+shift+z"`, `"cmd+opt+i"`. Modifiers: `cmd`, `shift`,
   * `alt`/`opt`, `ctrl`. Named keys: `enter`, `tab`, `space`, `escape`,
   * `backspace`, `left`, `right`, `up`, `down`.
   */
  shortcut?: string;
  /** A standard OS action. Mutually exclusive with `onSelect`. */
  role?: MenuRole;
  onSelect?: () => void;
  enabled?: boolean;
  checked?: boolean;
  /** Nested `<MenuItem>`s turn this into a submenu. */
  children?: ReactNode;
}

export function MenuItem({
  title,
  shortcut,
  role,
  onSelect,
  enabled,
  checked,
  children,
}: MenuItemProps): ReactElement {
  return createElement(
    "MenuItem",
    { title, shortcut, role, onSelect, enabled, checked },
    children,
  );
}

export function MenuSeparator(): ReactElement {
  return createElement("MenuSeparator", null);
}
