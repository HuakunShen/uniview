import { createContext } from "react";
import type { HostConfig, ReactContext } from "react-reconciler";
import {
  DefaultEventPriority,
  NoEventPriority,
} from "react-reconciler/constants";
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
type ChildSet = never;
type TimeoutHandle = ReturnType<typeof setTimeout>;
type NoTimeout = -1;

let instanceCounter = 0;
let currentUpdatePriority = NoEventPriority;
let activeContainer: Container | null = null;
let textNodeCounter = 0;

function generateId(): string {
  return `node-${instanceCounter++}`;
}

function generateTextNodeId(): string {
  return `text-${textNodeCounter++}`;
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

  shouldSetTextContent(_type: Type, _props: Props): boolean {
    return false;
  },

  getRootHostContext(): HostContext {
    return {};
  },

  getChildHostContext(parentHostContext): HostContext {
    return parentHostContext;
  },

  prepareForCommit(container: Container): null {
    activeContainer = container;
    container.mutationCollector?.beginCommit();
    return null;
  },

  resetAfterCommit(container: Container): void {
    // Flush mutations if collector is active
    if (container.mutationCollector) {
      const mutations = container.mutationCollector.flushCommit();
      if (mutations.length > 0) {
        container.mutationSubscribers.forEach((cb) => void cb(mutations));
      }
    }
    // Always notify full-mode subscribers
    container.update();
    activeContainer = null;
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
    return { _isTextNode: true, text, id: generateTextNodeId(), parent: null };
  },

  appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
    if ("_isTextNode" in child) {
      child.parent = parent;
      parent.children.push(child);
    } else {
      child.parent = parent;
      parent.children.push(child);
    }
    activeContainer?.mutationCollector?.collectAppendChild(parent, child);
  },

  appendChild(parent: Instance, child: Instance | TextInstance): void {
    if ("_isTextNode" in child) {
      child.parent = parent;
      parent.children.push(child);
    } else {
      child.parent = parent;
      parent.children.push(child);
    }
    activeContainer?.mutationCollector?.collectAppendChild(parent, child);
  },

  appendChildToContainer(container: Container, child: Instance): void {
    container.rootInstance = child;
    activeContainer?.mutationCollector?.collectSetRoot(child);
  },

  insertBefore(
    parent: Instance,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance,
  ): void {
    const index = parent.children.indexOf(beforeChild);
    if (index !== -1) {
      if ("_isTextNode" in child) {
        child.parent = parent;
      } else {
        child.parent = parent;
      }
      parent.children.splice(index, 0, child);
      activeContainer?.mutationCollector?.collectInsertBefore(
        parent,
        child,
        beforeChild,
      );
    }
  },

  removeChild(parent: Instance, child: Instance | TextInstance): void {
    const index = parent.children.indexOf(child);
    if (index !== -1) {
      parent.children.splice(index, 1);
      if ("_isTextNode" in child) {
        child.parent = null;
      } else {
        child.parent = null;
      }
      activeContainer?.mutationCollector?.collectRemoveChild(parent, child);
    }
  },

  removeChildFromContainer(container: Container, child: Instance): void {
    if (container.rootInstance === child) {
      container.rootInstance = null;
      activeContainer?.mutationCollector?.collectSetRoot(null);
    }
  },

  commitUpdate(
    instance: Instance,
    _type: Type,
    _oldProps: Props,
    newProps: Props,
  ): void {
    instance.props = { ...newProps };
    activeContainer?.mutationCollector?.collectSetProps(instance);
  },

  commitTextUpdate(
    textInstance: TextInstance,
    _oldText: string,
    newText: string,
  ): void {
    textInstance.text = newText;
    activeContainer?.mutationCollector?.collectSetText(textInstance);
  },

  finalizeInitialChildren(): boolean {
    return false;
  },

  clearContainer(container: Container): void {
    container.rootInstance = null;
    activeContainer?.mutationCollector?.collectSetRoot(null);
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
