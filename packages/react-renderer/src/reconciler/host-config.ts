import type { HostConfig } from "react-reconciler";
import type { InternalNode, TextNode } from "./types";
import type { RenderBridge } from "./bridge";
import type { MutationCollector } from "../serialization/mutation-collector";

type Type = string;
type Props = Record<string, unknown>;
type Container = RenderBridge;
type Instance = InternalNode;
type TextInstance = TextNode;
type SuspenseInstance = never;
type HydratableInstance = never;
type PublicInstance = Instance;
type HostContext = Record<string, never>;
type UpdatePayload = Record<string, unknown>;
type ChildSet = never;
type TimeoutHandle = ReturnType<typeof setTimeout>;
type NoTimeout = -1;

let instanceCounter = 0;

function generateId(): string {
	return `node-${instanceCounter++}`;
}

let mutationCollector: MutationCollector | null = null;

export function setMutationCollector(collector: MutationCollector | null): void {
	mutationCollector = collector;
}

export const hostConfig: HostConfig<
	Type,
	Props,
	Container,
	Instance,
	TextInstance,
	SuspenseInstance,
	HydratableInstance,
	PublicInstance,
	HostContext,
	UpdatePayload,
	ChildSet,
	TimeoutHandle,
	NoTimeout
> = {
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,

	getRootHostContext(): HostContext {
		return {};
	},

	getChildHostContext(parentHostContext): HostContext {
		return parentHostContext;
	},

	prepareForCommit(): null {
		return null;
	},

	resetAfterCommit(container: Container): void {
		if (mutationCollector) {
			const mutations = mutationCollector.flush();
			if (mutations.length > 0) {
				container.applyMutations(mutations);
			}
		} else {
			container.update();
		}
	},

	createInstance(
		type: Type,
		props: Props,
		_rootContainer: Container,
		_hostContext: HostContext,
	): Instance {
		return {
			type,
			props: { ...props },
			children: [],
			id: generateId(),
			parent: null,
		};
	},

	createTextInstance(
		text: string,
		_rootContainer: Container,
		_hostContext: HostContext,
	): TextInstance {
		return { _isTextNode: true, text };
	},

	appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
		if (!("_isTextNode" in child)) {
			child.parent = parent;
		}
		parent.children.push(child);
		if (mutationCollector) {
			mutationCollector.collectAppendChild(parent, child);
		}
	},

	appendChild(parent: Instance, child: Instance | TextInstance): void {
		if (!("_isTextNode" in child)) {
			child.parent = parent;
		}
		parent.children.push(child);
		if (mutationCollector) {
			mutationCollector.collectAppendChild(parent, child);
		}
	},

	appendChildToContainer(container: Container, child: Instance): void {
		container.rootInstance = child;
	},

	insertBefore(
		parent: Instance,
		child: Instance | TextInstance,
		beforeChild: Instance | TextInstance,
	): void {
		const index = parent.children.indexOf(beforeChild);
		if (index !== -1) {
			if (!("_isTextNode" in child)) {
				child.parent = parent;
			}
			parent.children.splice(index, 0, child);
			if (mutationCollector) {
				mutationCollector.collectInsertBefore(parent, child, beforeChild);
			}
		}
	},

	removeChild(parent: Instance, child: Instance | TextInstance): void {
		const index = parent.children.indexOf(child);
		if (index !== -1) {
			parent.children.splice(index, 1);
			if (!("_isTextNode" in child)) {
				child.parent = null;
			}
			if (mutationCollector) {
				mutationCollector.collectRemoveChild(parent, child);
			}
		}
	},

	removeChildFromContainer(container: Container, child: Instance): void {
		if (container.rootInstance === child) {
			container.rootInstance = null;
		}
	},

	commitUpdate(
		instance: Instance,
		_updatePayload: UpdatePayload,
		_type: Type,
		oldProps: Props,
		newProps: Props,
	): void {
		instance.props = { ...newProps };
		if (mutationCollector) {
			mutationCollector.collectCommitUpdate(instance, oldProps, newProps);
		}
	},

	commitTextUpdate(
		textInstance: TextInstance,
		_oldText: string,
		newText: string,
	): void {
		textInstance.text = newText;
		if (mutationCollector) {
			mutationCollector.collectCommitTextUpdate(textInstance, newText);
		}
	},

	finalizeInitialChildren(): boolean {
		return false;
	},

	prepareUpdate(
		_instance: Instance,
		_type: Type,
		oldProps: Props,
		newProps: Props,
	): UpdatePayload | null {
		const oldKeys = Object.keys(oldProps);
		const newKeys = Object.keys(newProps);

		if (oldKeys.length !== newKeys.length) {
			return newProps;
		}

		for (const key of newKeys) {
			if (oldProps[key] !== newProps[key]) {
				return newProps;
			}
		}

		return null;
	},

	shouldSetTextContent(_type: Type, _props: Props): boolean {
		return false;
	},

	clearContainer(container: Container): void {
		container.rootInstance = null;
	},

	getPublicInstance(instance: Instance): PublicInstance {
		return instance;
	},

	preparePortalMount(): void {},

	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,
	noTimeout: -1 as NoTimeout,
	isPrimaryRenderer: false,

	getCurrentEventPriority: () => 99 as unknown as number,
	getInstanceFromNode: () => null,
	beforeActiveInstanceBlur: () => {},
	afterActiveInstanceBlur: () => {},
	prepareScopeUpdate: () => {},
	getInstanceFromScope: () => null,
	detachDeletedInstance: () => {},
};
