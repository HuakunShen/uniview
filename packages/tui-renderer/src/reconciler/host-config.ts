import { createContext } from "react";
import type { HostConfig, ReactContext } from "react-reconciler";
import { DefaultEventPriority, NoEventPriority } from "react-reconciler/constants";
import type { TuiContainer, TuiNode, TextNode } from "./types";

type Type = string;
type Props = Record<string, unknown>;
type Container = TuiContainer;
type Instance = TuiNode;
type TextInstance = TextNode;
type SuspenseInstance = never;
type HydratableInstance = never;
type PublicInstance = Instance;
type HostContext = Record<string, never>;
type ChildSet = never;
type TimeoutHandle = ReturnType<typeof setTimeout>;
type NoTimeout = -1;

let instanceCounter = 0;
let currentUpdatePriority = NoEventPriority;

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
  never, // FormInstance
  PublicInstance,
  HostContext,
  ChildSet,
  TimeoutHandle,
  NoTimeout,
  null // TransitionStatus
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

  shouldSetTextContent(): boolean {
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

  setCurrentUpdatePriority(newPriority: number) {
    currentUpdatePriority = newPriority;
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority() {
    if (currentUpdatePriority !== NoEventPriority) {
      return currentUpdatePriority;
    }
    return DefaultEventPriority;
  },

  shouldAttemptEagerTransition: () => false,
  maySuspendCommit: () => false,
  NotPendingTransition: null,
  HostTransitionContext: createContext(null) as unknown as ReactContext<null>,
  resetFormInstance() {},
  requestPostPaintCallback() {},
  trackSchedulerEvent() {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  preloadInstance: () => true,
  startSuspendingCommit() {},
  suspendInstance() {},
  waitForCommitToBeReady: () => null,

  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,
  detachDeletedInstance: () => {},
};
