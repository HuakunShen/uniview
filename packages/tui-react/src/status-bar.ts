import { createElement, type ReactElement } from "react";
import type { TuiCommonProps } from "./primitives";

export interface StatusItem {
	label: string;
	keyHint: string;
}

export interface StatusBarProps extends TuiCommonProps {
	items: readonly StatusItem[];
	/** Separator between items. Defaults to `" | "`. */
	separator?: string;
}

/** A docked keybinding bar (lazygit's bottom row). */
export function StatusBar(props: StatusBarProps): ReactElement {
	const { items, separator = " | ", children, ...rest } = props;
	void children;
	const text = items.map((i) => `${i.label}: ${i.keyHint}`).join(separator);
	return createElement("box", { ...rest, flexDirection: "row" }, createElement("text", null, text));
}
