export type ScreenMode = "alternate" | "main" | "inline";
export type MouseMode = "off" | "click" | "drag" | "motion";

export interface TerminalModeOptions {
  screen: ScreenMode;
  mouse: MouseMode;
  bracketedPaste: boolean;
  focusReporting: boolean;
  hideCursor: boolean;
}

export const DEFAULT_MODE_OPTIONS: TerminalModeOptions = {
  screen: "alternate",
  mouse: "click",
  bracketedPaste: true,
  focusReporting: true,
  hideCursor: true,
};

const ALT_SCREEN_ENTER = "\x1b[?1049h";
const ALT_SCREEN_LEAVE = "\x1b[?1049l";
const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";
const BRACKETED_PASTE_ON = "\x1b[?2004h";
const BRACKETED_PASTE_OFF = "\x1b[?2004l";
const FOCUS_REPORTING_ON = "\x1b[?1004h";
const FOCUS_REPORTING_OFF = "\x1b[?1004l";
const SGR_MOUSE_ON = "\x1b[?1006h";
const SGR_MOUSE_OFF = "\x1b[?1006l";
const MOUSE_CLICK_ON = "\x1b[?1000h";
const MOUSE_CLICK_OFF = "\x1b[?1000l";
const MOUSE_DRAG_ON = "\x1b[?1002h";
const MOUSE_DRAG_OFF = "\x1b[?1002l";
const MOUSE_MOTION_ON = "\x1b[?1003h";
const MOUSE_MOTION_OFF = "\x1b[?1003l";

function mouseEnable(mouse: MouseMode): string {
  if (mouse === "off") return "";
  let seq = MOUSE_CLICK_ON;
  if (mouse === "drag") seq += MOUSE_DRAG_ON;
  if (mouse === "motion") seq += MOUSE_DRAG_ON + MOUSE_MOTION_ON;
  return seq + SGR_MOUSE_ON;
}

function mouseDisable(mouse: MouseMode): string {
  if (mouse === "off") return "";
  return SGR_MOUSE_OFF + MOUSE_MOTION_OFF + MOUSE_DRAG_OFF + MOUSE_CLICK_OFF;
}

/** Sequence to configure the terminal when a session begins. */
export function buildEnterSequence(options: TerminalModeOptions): string {
  let seq = "";
  if (options.screen === "alternate") seq += ALT_SCREEN_ENTER;
  if (options.hideCursor) seq += CURSOR_HIDE;
  seq += mouseEnable(options.mouse);
  if (options.bracketedPaste) seq += BRACKETED_PASTE_ON;
  if (options.focusReporting) seq += FOCUS_REPORTING_ON;
  return seq;
}

/** Sequence to restore the terminal when a session ends (reverse order). */
export function buildLeaveSequence(options: TerminalModeOptions): string {
  let seq = "";
  if (options.focusReporting) seq += FOCUS_REPORTING_OFF;
  if (options.bracketedPaste) seq += BRACKETED_PASTE_OFF;
  seq += mouseDisable(options.mouse);
  seq += CURSOR_SHOW;
  if (options.screen === "alternate") seq += ALT_SCREEN_LEAVE;
  return seq;
}
