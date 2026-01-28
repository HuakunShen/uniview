import type { HostConfig } from "react-reconciler";
import type { InternalNode, TextNode } from "./types";
import type { RenderBridge } from "./bridge";

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
    container.update();
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
    if ("_isTextNode" in child) {
      parent.children.push(child);
    } else {
      child.parent = parent;
      parent.children.push(child);
    }
  },

  appendChild(parent: Instance, child: Instance | TextInstance): void {
    if ("_isTextNode" in child) {
      parent.children.push(child);
    } else {
      child.parent = parent;
      parent.children.push(child);
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
    }
  },

  removeChild(parent: Instance, child: Instance | TextInstance): void {
    const index = parent.children.indexOf(child);
    if (index !== -1) {
      parent.children.splice(index, 1);
      if (!("_isTextNode" in child)) {
        child.parent = null;
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
    _oldProps: Props,
    newProps: Props,
  ): void {
    instance.props = { ...newProps };
  },

  commitTextUpdate(
    textInstance: TextInstance,
    _oldText: string,
    newText: string,
  ): void {
    textInstance.text = newText;
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
