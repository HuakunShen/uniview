import { createElement, spread } from "@uniview/solid-renderer"
import type { AnyNode } from "@uniview/solid-renderer"

export interface SwitchProps {
	id?: string
	checked?: boolean
	defaultChecked?: boolean
	disabled?: boolean
	onChange?: (checked: boolean) => void
	className?: string
}

export function Switch(props: SwitchProps): AnyNode {
	const el = createElement("Switch")
	spread(el, props)
	return el
}
