import { createElement, spread, insert } from "@uniview/solid-renderer"
import type { AnyNode } from "@uniview/solid-renderer"
import type { JSX } from "solid-js"

export interface ButtonProps {
	children?: JSX.Element
	title?: string
	variant?: "primary" | "secondary" | "outline" | "destructive" | "ghost"
	onClick?: () => void
	disabled?: boolean
	className?: string
}

export function Button(props: ButtonProps): AnyNode {
	const el = createElement("Button")
	spread(el, props, true)
	insert(el, () => props.children)
	return el
}
