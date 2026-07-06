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

/**
 * Remove a child from its current parent's children array (if attached).
 * React's commitPlacement reuses appendChild/insertBefore to MOVE existing
 * keyed instances; DOM insertBefore auto-detaches, an array-based host
 * config must do it explicitly or reorders duplicate the child.
 */
function detachFromParent(child: Instance | TextInstance): void {
  const prevParent = child.parent;
  if (!prevParent) return;
  const index = prevParent.children.indexOf(child);
  if (index !== -1) {
    prevParent.children.splice(index, 1);
  }
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
    // React reuses appendChild to MOVE an existing keyed child (e.g. list
    // reorders). Detach it from its current parent first, otherwise it ends
    // up in the children array twice.
    detachFromParent(child);
    child.parent = parent;
    parent.children.push(child);
    activeContainer?.mutationCollector?.collectAppendChild(parent, child);
  },

  appendChildToContainer(container: Container, child: Instance): void {
    if (container.rootInstance !== null && container.rootInstance !== child) {
      // The protocol tree has exactly one root; silently overwriting it
      // used to drop every top-level sibling but the last.
      throw new Error(
        "[uniview] plugin root must be a single element — wrap top-level siblings (fragment children) in one parent element",
      );
    }
    container.rootInstance = child;
    activeContainer?.mutationCollector?.collectSetRoot(child);
  },

  insertInContainerBefore(
    container: Container,
    _child: Instance,
    _beforeChild: Instance,
  ): void {
    // Only reachable with multiple container children, which the protocol
    // does not support (single-root tree). Previously this method was
    // missing entirely and React crashed with a bare TypeError.
    void container;
    throw new Error(
      "[uniview] plugin root must be a single element — wrap top-level siblings (fragment children) in one parent element",
    );
  },

  insertBefore(
    parent: Instance,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance,
  ): void {
    // Like appendChild, insertBefore is also used to MOVE existing keyed
    // children during reorders. Detach first — and only then resolve the
    // beforeChild index, since detaching from the same parent shifts it.
    detachFromParent(child);
    const index = parent.children.indexOf(beforeChild);
    if (index === -1) {
      // React guarantees beforeChild is a child of parent; reaching this
      // means the internal tree already diverged from React's view. The
      // child was detached above — appending keeps it in the tree instead
      // of silently dropping it, but the order is no longer trustworthy.
      console.error(
        `[uniview] insertBefore anchor ${"_isTextNode" in beforeChild ? "text" : beforeChild.type}#${beforeChild.id} not found under ${parent.type}#${parent.id}; appending instead (tree state diverged)`,
      );
      child.parent = parent;
      parent.children.push(child);
      activeContainer?.mutationCollector?.collectAppendChild(parent, child);
      return;
    }
    child.parent = parent;
    parent.children.splice(index, 0, child);
    activeContainer?.mutationCollector?.collectInsertBefore(
      parent,
      child,
      beforeChild,
    );
  },

  removeChild(parent: Instance, child: Instance | TextInstance): void {
    const index = parent.children.indexOf(child);
    if (index !== -1) {
      parent.children.splice(index, 1);
      child.parent = null;
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

  // Suspense visibility: React hides mounted content while a boundary
  // shows its fallback. Hidden nodes stay in the internal tree but are
  // excluded from serialization; in incremental mode the collector emits
  // remove/insert mutations so hosts converge.
  hideInstance(instance: Instance): void {
    instance.hidden = true;
    activeContainer?.mutationCollector?.collectHide(instance);
  },

  unhideInstance(instance: Instance, _props: Props): void {
    instance.hidden = false;
    activeContainer?.mutationCollector?.collectUnhide(instance);
  },

  hideTextInstance(textInstance: TextInstance): void {
    textInstance.hidden = true;
    activeContainer?.mutationCollector?.collectHide(textInstance);
  },

  unhideTextInstance(textInstance: TextInstance, text: string): void {
    textInstance.text = text;
    textInstance.hidden = false;
    activeContainer?.mutationCollector?.collectUnhide(textInstance);
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
