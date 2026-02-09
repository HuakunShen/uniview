import { createElement, spread, insert } from "@uniview/solid-renderer"
import type { AnyNode } from "@uniview/solid-renderer"
import type { JSX } from "solid-js"

export interface ToggleProps {
	children?: JSX.Element
	pressed?: boolean
	defaultPressed?: boolean
	disabled?: boolean
	variant?: "default" | "outline"
	size?: "default" | "sm" | "lg"
	onClick?: () => void
	className?: string
}

export function Toggle(props: ToggleProps): AnyNode {
	const el = createElement("Toggle")
	spread(el, props, true)
	insert(el, () => props.children)
	return el
}
