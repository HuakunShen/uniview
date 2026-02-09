import { createElement, spread } from "@uniview/solid-renderer"
import type { AnyNode } from "@uniview/solid-renderer"

export interface InputProps {
	id?: string
	value?: string
	defaultValue?: string
	placeholder?: string
	label?: string
	type?: "text" | "email" | "password" | "number" | "tel" | "url"
	disabled?: boolean
	onChange?: (value: string) => void
	className?: string
}

export function Input(props: InputProps): AnyNode {
	const el = createElement("Input")
	spread(el, props)
	return el
}
