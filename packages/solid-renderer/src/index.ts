// Renderer exports
export {
	render,
	effect,
	memo,
	createComponent,
	createElement,
	createTextNode,
	insertNode,
	insert,
	spread,
	setProp,
	mergeProps,
	use,
	setUpdateCallback,
	setMutationUpdateCallback,
	setMutationCollector,
	getRootNode,
	setRootNode,
} from "./renderer/reconciler";

// Types
export type {
	SolidNode,
	SolidTextNode,
	SolidSlotNode,
	AnyNode,
} from "./renderer/types";
export { generateId, resetIdCounter } from "./renderer/types";

// Serialization
export { HandlerRegistry } from "./serialization/handler-registry";
export { serializeTree } from "./serialization/serialize";
export { serializeProps } from "./serialization/serialize-props";

// Mutation
export { SolidMutationCollector } from "./mutation/mutation-collector";

// Re-exports from solid-js
export {
	For,
	Show,
	Switch,
	Match,
	Index,
	ErrorBoundary,
	createSignal,
	createEffect,
	createMemo,
	onMount,
	onCleanup,
	batch,
	untrack,
	createContext,
	useContext,
} from "solid-js";
