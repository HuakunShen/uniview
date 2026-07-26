/**
 * Step 09 — Vue and React hosts: the same three jobs, twice.
 *
 * Step 07 defined the seam (`PluginController`, `ComponentRegistry`) and step 08
 * wrote the first real web host in Svelte. This step writes the other two web
 * hosts — React and Vue — and runs BOTH of them, for real, over one `UINode`
 * tree, so you can read the diff instead of taking it on faith.
 *
 * The claim this step exists to make concrete: a host adapter is about two
 * hundred lines of framework-idiomatic glue, and every one of those lines is in
 * service of exactly THREE JOBS.
 *
 *   JOB 1  RECURSE. Walk `UINode.children`, rendering each child the same way
 *          the parent was rendered. Every adapter is a self-referencing
 *          function or a self-referencing component; the protocol's tree is
 *          arbitrarily deep and nothing else in the host knows its shape.
 *
 *   JOB 2  TRANSFORM PROPS. `props` arrives as `Record<string, JSONValue>` and
 *          the framework wants something else. Two sub-jobs:
 *            (a) `_onClickHandlerId: "h_click"` is not an attribute. It is a
 *                string standing in for a function that lives on the other side
 *                of a boundary (step 13). The adapter must turn it back into a
 *                real callback — one that calls `controller.executeHandler(id)`.
 *            (b) the rest are attributes, renamed to that framework's spelling.
 *
 *   JOB 3  RESOLVE `type`. Layout tag -> render it directly. Registered product
 *          primitive -> `registry.get(type)`. Neither -> a VISIBLE fallback.
 *          Never a throw, never a silent drop: an unknown `type` is the normal
 *          case, because the plugin was written by someone else.
 *
 * What is genuinely SHARED between adapters is the algorithm, the protocol
 * helpers (`isHandlerIdProp`, `extractEventName`, `textContent`), and the
 * handler-id convention. What is adapter-SPECIFIC is everything about how the
 * framework is spoken: how the controller reaches a node twelve levels down
 * (React `createContext` vs Vue `provide`/`inject` vs Svelte `setContext`),
 * whether the class attribute is called `className` or `class`, whether the
 * click prop is `onClick` or `onclick`, and how children are handed to a
 * component.
 *
 * Everything below `renderToStaticMarkup` / `renderToString` in this file is
 * real: React and Vue are installed in `learn/` and both hosts actually render.
 * The HTML you see printed came out of the frameworks, not out of a template
 * literal.
 *
 * Read this file next to `steps/08-svelte-host/main.ts`: the section numbering
 * and the printing are deliberately the same so the two diff cleanly.
 */

import { createContext, createElement, useContext } from "react"
import type { ComponentType, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createSSRApp, defineComponent, h, inject, provide, computed } from "vue"
import type { Component as VueComponent, InjectionKey, PropType, VNode } from "vue"
import { renderToString } from "vue/server-renderer"

// ---------------------------------------------------------------------------
// 1. Carried forward — the protocol, and the four helpers every host imports
// ---------------------------------------------------------------------------
//
// Steps never import each other and never import `@uniview/*`; each directory
// stands alone. This section is `packages/protocol` reduced to what a web host
// actually touches. If you did steps 07-08, nothing here is new — but read
// section 1c, because THOSE FOUR FUNCTIONS are the entire shared surface
// between the two adapters below. Everything else they have in common they had
// to write twice.

/** The only value kinds allowed in props: whatever a Swift decoder can rebuild. */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue }

/** Reserved node type for text content. Text is a node so mutations can address it. */
const TEXT_NODE_TYPE = "#text"

/** A subset of the real 39-entry `LAYOUT_TAGS`, kept to the tags used below. */
const LAYOUT_TAGS = ["div", "span", "p", "ul", "li", "button", "input", "em"] as const
type UILayoutTag = (typeof LAYOUT_TAGS)[number]

/** The whole node type: four required fields, one optional. */
export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
}

/** A function cannot cross a Worker boundary, so a callback travels as a string. */
export type HandlerId = string

// --- 1b. the event whitelist, verbatim in spirit from protocol/src/events.ts --
//
// Eleven names. This list is why `extractEventName` can return `null` for a
// prop that IS a handler-id prop: `_onSearchTextChangeHandlerId` matches the
// shape but is not a DOM event, and the three real adapters disagree about what
// to do with it. Printed section 5 puts the three answers side by side.

type EventPropName =
  | "onClick"
  | "onChange"
  | "onInput"
  | "onSubmit"
  | "onFocus"
  | "onBlur"
  | "onKeyDown"
  | "onKeyUp"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onWheel"

const EVENT_PROPS: readonly EventPropName[] = [
  "onClick",
  "onChange",
  "onInput",
  "onSubmit",
  "onFocus",
  "onBlur",
  "onKeyDown",
  "onKeyUp",
  "onMouseEnter",
  "onMouseLeave",
  "onWheel",
] as const

// --- 1c. THE SHARED SURFACE ---------------------------------------------------
//
// Both adapters import exactly these from the protocol. Printed section 8 proves
// it by intersecting the two hosts' actual function objects.

/** `_onClickHandlerId` -> true. Shape only; the whitelist check is separate. */
function isHandlerIdProp(propName: string): boolean {
  return propName.startsWith("_") && propName.endsWith("HandlerId")
}

const HANDLER_ID_PREFIX_LENGTH = 1
const HANDLER_ID_SUFFIX_LENGTH = 9

/** `_onClickHandlerId` -> `"onClick"`, or `null` if it is not a DOM event. */
function extractEventName(handlerIdProp: string): EventPropName | null {
  if (!isHandlerIdProp(handlerIdProp)) return null
  const eventName = handlerIdProp.slice(
    HANDLER_ID_PREFIX_LENGTH,
    -HANDLER_ID_SUFFIX_LENGTH,
  )
  if (EVENT_PROPS.includes(eventName as EventPropName)) {
    return eventName as EventPropName
  }
  return null
}

/** Text of a child, whether it is a v3 text node or a legacy bare string. */
function textContent(node: UINode | string): string | null {
  if (typeof node === "string") return node
  if (node.type === TEXT_NODE_TYPE) return node.text ?? ""
  return null
}

const isLayoutTag = (type: string): type is UILayoutTag =>
  (LAYOUT_TAGS as readonly string[]).includes(type)

/** Both real web adapters carry this list; both spell it the same way. */
const VOID_ELEMENTS = ["br", "hr", "img", "input", "meta", "link"]

// ---------------------------------------------------------------------------
// 2. Carried forward from step 07 — ComponentRegistry
// ---------------------------------------------------------------------------
//
// Unchanged, except that this step finally uses the type parameter for what it
// is for: `ComponentRegistry<ComponentType>` in React and
// `ComponentRegistry<Component>` in Vue, from the SAME interface.

export interface ComponentMetadata {
  version?: string
  propTypes?: Record<string, unknown>
}

export interface ComponentRegistry<T = unknown> {
  register(type: string, component: T, metadata?: ComponentMetadata): void
  get(type: string): T | undefined
  has(type: string): boolean
  list(): string[]
  clear(): void
}

function createComponentRegistry<T>(): ComponentRegistry<T> {
  const entries = new Map<string, { component: T; metadata?: ComponentMetadata }>()
  return {
    register(type, component, metadata) {
      entries.set(type, { component, metadata })
    },
    get(type) {
      return entries.get(type)?.component
    },
    has(type) {
      return entries.has(type)
    },
    list() {
      return Array.from(entries.keys())
    },
    clear() {
      entries.clear()
    },
  }
}

// ---------------------------------------------------------------------------
// 3. Carried forward from step 07 — PluginController, and a scripted one
// ---------------------------------------------------------------------------

export type HostMode = "worker" | "websocket" | "main"

/** Ten members, exactly as step 07 defined them. */
export interface PluginController {
  connect(): Promise<void>
  disconnect(): Promise<void>
  updateProps(props: JSONValue): Promise<void>
  executeHandler(handlerId: HandlerId, args?: JSONValue[]): Promise<void>
  destroy(): Promise<void>
  syncTree(): Promise<void>
  getStatus(): { mode: HostMode; connected: boolean; lastError?: string }
  getTree(): UINode | null
  subscribe(cb: (tree: UINode | null) => void): () => void
  subscribeErrors?(cb: (message: string) => void): () => void
}

/** Every call the hosts made, in order. Printed section 6's evidence. */
interface HandlerCall {
  handlerId: HandlerId
  args: JSONValue[]
}

/**
 * A stand-in plugin. Step 07's `ScriptedController` replayed mutation batches
 * through a `MutableTree`; this one keeps state and re-renders a whole tree,
 * which is shorter and — crucially — indistinguishable to a host. A host only
 * ever receives `UINode | null` from `subscribe`; whether the controller folded
 * six mutations or rebuilt the tree is stage D's business, not the adapter's.
 */
class ScriptedController implements PluginController {
  clicks = 0
  note = ""
  readonly calls: HandlerCall[] = []

  private current: UINode | null = null
  private isConnected = false
  private readonly subscribers = new Set<(tree: UINode | null) => void>()

  constructor(private readonly build: (state: ScriptedController) => UINode) {}

  async connect(): Promise<void> {
    this.isConnected = true
    this.render()
  }

  async disconnect(): Promise<void> {
    this.isConnected = false
    this.current = null
    this.notify()
  }

  async destroy(): Promise<void> {
    await this.disconnect()
    this.subscribers.clear()
  }

  async updateProps(): Promise<void> {}

  /**
   * The one method this whole step is pointed at. Both adapters, written
   * independently in two frameworks, end up calling exactly this — with the
   * same id and, where the event carries a payload, the same args.
   */
  async executeHandler(handlerId: HandlerId, args: JSONValue[] = []): Promise<void> {
    if (!this.isConnected) return
    this.calls.push({ handlerId, args })
    if (handlerId === "h_click") this.clicks++
    if (handlerId === "h_input") this.note = String(args[0] ?? "")
    this.render()
  }

  async syncTree(): Promise<void> {
    if (this.isConnected) this.notify()
  }

  getTree(): UINode | null {
    return this.current
  }

  getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
    return { mode: "main", connected: this.isConnected }
  }

  subscribe(cb: (tree: UINode | null) => void): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  private render(): void {
    this.current = this.build(this)
    this.notify()
  }

  private notify(): void {
    for (const cb of this.subscribers) cb(this.current)
  }
}

// ---------------------------------------------------------------------------
// 4. The ONE tree both hosts render
// ---------------------------------------------------------------------------

const text = (id: string, content: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: content,
})

/**
 * Six things are packed in here on purpose, one per thing an adapter has to get
 * right:
 *
 *   `div > ul > li > #text`   nested layout          -> JOB 1 (recursion, depth 4)
 *   `_onClickHandlerId`       a handler prop         -> JOB 2a
 *   `className`               a renamed attribute    -> JOB 2b
 *   `Badge`                   a REGISTERED primitive -> JOB 3, registry hit
 *   `Sparkline`               an UNREGISTERED type   -> JOB 3, fallback
 *   `_onSearchTextChange...`  a handler prop that is NOT a DOM event
 *                             -> the whitelist branch the three real adapters
 *                                disagree about (printed section 5)
 */
const buildTree = (state: ScriptedController): UINode => ({
  id: "n1",
  type: "div",
  props: { className: "card" },
  children: [
    {
      id: "n2",
      type: "p",
      props: { className: "muted" },
      children: [text("n3", `Clicked ${state.clicks} times`)],
    },
    {
      id: "n4",
      type: "button",
      props: { className: "primary", disabled: false, _onClickHandlerId: "h_click" },
      children: [text("n5", "Click me")],
    },
    {
      id: "n6",
      type: "input",
      props: { className: "field", placeholder: "note", _onInputHandlerId: "h_input" },
      children: [],
    },
    {
      id: "n7",
      type: "ul",
      props: {},
      children: [
        { id: "n8", type: "li", props: {}, children: [text("n9", "alpha")] },
        { id: "n10", type: "li", props: {}, children: [text("n11", state.note || "beta")] },
      ],
    },
    {
      id: "n12",
      type: "Badge",
      props: { tone: "info", _onSearchTextChangeHandlerId: "h_search" },
      children: [text("n13", "synced")],
    },
    { id: "n14", type: "Sparkline", props: { values: [1, 3, 5] }, children: [] },
  ],
})

// ---------------------------------------------------------------------------
// 5. Teaching instrumentation (not part of either adapter)
// ---------------------------------------------------------------------------
//
// Kept in one place and clearly labelled so the adapters below can be read as
// the real files. Each adapter records: how many times it pulled the controller
// out of context (proof that context, not prop-threading, is what carries it),
// and every callback it built out of a handler id (so printed section 6 can fire
// one).

interface Instrumentation {
  contextReads: number
  handlers: { handlerId: HandlerId; eventName: EventPropName; call: EventHandler }[]
}
const newInstrumentation = (): Instrumentation => ({ contextReads: 0, handlers: [] })

/** The shape both adapters build in `createHandler`. Identical by coincidence
 *  of the problem, not by sharing: neither file imports it from the other. */
type EventHandler = (...args: unknown[]) => Promise<void>

/**
 * A fake DOM event, so printed section 6 can fire an input listener with no DOM.
 * `currentTarget` AND `target` are both present because — see printed section 5 —
 * the
 * React adapter reads one and the Vue adapter reads the other.
 */
const fakeInputEvent = (value: string): unknown => ({
  currentTarget: { value },
  target: { value },
  preventDefault: () => {},
})

// ===========================================================================
// 6. HOST 1 — REACT
// ===========================================================================
//
// Distilled from examples/host-react-demo/src/lib/plugin/{PluginContext.ts,
// PluginHost.tsx, ComponentRenderer.tsx}. Written with `createElement` rather
// than JSX because `learn/` has no JSX build step; `createElement("div", p, kids)`
// is what `<div {...p}>{kids}</div>` compiles to, so nothing is lost but the
// angle brackets.

// --- 6a. the context mechanism ---------------------------------------------
//
// React's answer: a context OBJECT, created at module scope, with a `.Provider`
// component and a `useContext` hook. The value is a plain object holding both
// the controller and the registry.

interface ReactPluginContextValue {
  controller: PluginController
  registry: ComponentRegistry<ComponentType>
}

const ReactPluginContext = createContext<ReactPluginContextValue | null>(null)

const reactInstrumentation = newInstrumentation()

function useReactPluginContext(): ReactPluginContextValue {
  const context = useContext(ReactPluginContext)
  reactInstrumentation.contextReads++ // teaching only
  if (!context) {
    // Verbatim from the real file. A renderer outside a host is a programming
    // error, not a runtime condition — so this one DOES throw.
    throw new Error("usePluginContext must be used within a PluginHost")
  }
  return context
}

// --- 6b. JOB 2, React spelling ---------------------------------------------

interface ReactTransformedProps {
  attrs: Record<string, unknown>
  onClick?: EventHandler
  onInput?: EventHandler
  onChange?: EventHandler
  onKeyDown?: EventHandler
}

/**
 * The real file has one branch per whitelisted event and eleven fields on
 * `TransformedProps`; the shape is identical, this is four of them.
 *
 * Two things to notice, both load-bearing:
 *
 *   - `if (eventName && ...)` then `continue`. A handler-id prop that is NOT in
 *     the whitelist falls off the end of the branch and is DROPPED. React and
 *     Vue both do this. Svelte deliberately does not (printed section 5).
 *   - `className` and `htmlFor` survive as `className` / `htmlFor`, because
 *     React's DOM props are spelled that way. Vue and Svelte rename them to
 *     `class` / `for`. This is the whole of "attribute naming" as a per-adapter
 *     concern: one `if`, three answers.
 */
function reactTransformProps(
  props: Record<string, JSONValue>,
  createHandler: (handlerId: string, eventName: EventPropName) => EventHandler,
): ReactTransformedProps {
  const attrs: Record<string, unknown> = {}
  const result: ReactTransformedProps = { attrs }

  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "key") continue

    if (isHandlerIdProp(key)) {
      const eventName = extractEventName(key)
      if (eventName && typeof value === "string") {
        const handler = createHandler(value, eventName)
        if (eventName === "onChange") {
          result.onInput = handler
          result.onChange = handler
        } else if (eventName === "onInput") {
          result.onInput = handler
        } else if (eventName === "onClick") {
          result.onClick = handler
        } else if (eventName === "onKeyDown") {
          result.onKeyDown = handler
        }
      }
      continue
    }

    if (key === "className") {
      attrs.className = value
    } else if (key === "htmlFor") {
      attrs.htmlFor = value
    } else {
      attrs[key] = value
    }
  }

  return result
}

/**
 * The event-shape adapters. In the real file these live inside the component;
 * they are lifted to module scope here only so printed section 6 can reuse them
 * without rendering. They close over nothing, so nothing changes.
 *
 * `withInputValue` is where React and Vue genuinely diverge: React reads
 * `event.currentTarget.value` (typed `React.FormEvent<HTMLInputElement>`), Vue
 * reads `event.target.value` (typed `Event`).
 */
const reactWithoutEvent = (handler?: EventHandler): (() => void) | undefined => {
  if (!handler) return undefined
  return () => {
    void handler()
  }
}

const reactWithInputValue = (
  handler?: EventHandler,
): ((event: { currentTarget: { value: string } }) => void) | undefined => {
  if (!handler) return undefined
  return (event) => {
    void handler(event.currentTarget.value)
  }
}

// --- 6c. JOBS 1 and 3: the recursive component ------------------------------

/**
 * One component per node — the web idiom step 08 introduced in Svelte. It takes
 * ONE prop, `node`. Not the controller, not the registry, not the depth: those
 * come from context, which is the only reason a fifty-level tree does not have
 * to thread three arguments through fifty frames.
 */
function ReactComponentRenderer({ node }: { node: UINode | string }): ReactNode {
  const { controller, registry } = useReactPluginContext()

  // JOB 1, base cases: a legacy bare string, and a v3 text node.
  if (typeof node === "string") return node
  if (node.type === TEXT_NODE_TYPE) return node.text

  function createHandler(handlerId: string, eventName: EventPropName): EventHandler {
    // THE POINT OF THE HANDLER-ID CONVENTION. The plugin's real callback lives
    // wherever the plugin lives — possibly another thread, possibly another
    // machine. What crossed the boundary was the string `handlerId`. This
    // closure is the host-side function that string stands for.
    const handler: EventHandler = async (...args: unknown[]) => {
      await controller.executeHandler(handlerId, args as JSONValue[])
    }
    reactInstrumentation.handlers.push({ handlerId, eventName, call: handler }) // teaching only
    return handler
  }

  const { type, props, children } = node
  const p = reactTransformProps(props, createHandler)

  // JOB 1, the recursive step. `key` is React's list identity; the real file
  // uses the array index, as here.
  const renderChildren = (): ReactNode[] =>
    children.map((child, index) =>
      createElement(ReactComponentRenderer, { key: index, node: child }),
    )

  // JOB 3, branch 1: layout tags the adapter special-cases because they need an
  // event wired in a particular shape.
  if (type === "button") {
    return createElement(
      "button",
      {
        className: `cursor-pointer ${p.attrs.className || ""}`,
        ...p.attrs,
        onClick: reactWithoutEvent(p.onClick),
      },
      renderChildren(),
    )
  }

  if (type === "input") {
    return createElement("input", {
      ...p.attrs,
      onInput: reactWithInputValue(p.onInput),
      onChange: reactWithInputValue(p.onChange),
    })
  }

  // JOB 3, branch 2: the generic layout tag. `LAYOUT_TAGS` is append-only by
  // policy, so a host is allowed to hardcode it — this is the one place where
  // hardcoding a `type` is not a prime-directive violation.
  if (isLayoutTag(type)) {
    if (VOID_ELEMENTS.includes(type)) return createElement(type, p.attrs)
    return createElement(type, p.attrs, renderChildren())
  }

  // JOB 3, branch 3: a product primitive, resolved through the registry. Note
  // how children are passed — as trailing VARARGS to `createElement`, with the
  // flattened text first. That is React's calling convention and it is the
  // single biggest structural difference from the Vue adapter below.
  if (registry?.has(type)) {
    const RegisteredComponent = registry.get(type)!
    const textChildren = children.map((child) => textContent(child) ?? "").join("")
    const nonTextChildren = children.filter((child) => textContent(child) === null)

    const componentProps: Record<string, unknown> = {
      ...p.attrs,
      title: textChildren || p.attrs.title,
      onClick: p.onClick,
      onInput: p.onInput,
      onChange: p.onChange,
      onKeyDown: p.onKeyDown,
    }

    if (nonTextChildren.length > 0 || textChildren) {
      return createElement(
        RegisteredComponent,
        componentProps,
        textChildren,
        ...nonTextChildren.map((child, index) =>
          createElement(ReactComponentRenderer, { key: index, node: child }),
        ),
      )
    }
    return createElement(RegisteredComponent, componentProps)
  }

  // JOB 3, branch 4: the fallback. Visible, never thrown, never dropped.
  return createElement("div", { className: "uniview-unknown" }, "Unknown: ", type)
}

/**
 * The host component. The real one owns `useState`/`useEffect`, subscribes to
 * the controller and calls `connect()`; server rendering has no effects, so the
 * tree is handed in and the driver in section 8 owns the subscription instead.
 * What is unchanged — and what this step cares about — is the Provider.
 */
function ReactPluginHost({
  controller,
  registry,
  tree,
}: {
  controller: PluginController
  registry: ComponentRegistry<ComponentType>
  tree: UINode | null
}): ReactNode {
  return createElement(
    ReactPluginContext.Provider,
    { value: { controller, registry } },
    tree
      ? createElement(ReactComponentRenderer, { node: tree })
      : createElement("div", null, "Loading..."),
  )
}

// --- 6d. one registered product primitive -----------------------------------
//
// This is the APPLICATION's code, not the renderer's: `Badge` is a name the app
// chose and pointed at a component of its own. The renderer has never heard of
// it. (Compare the real registrations in App.tsx: Button, Input, Switch, Toggle.)

function ReactBadge({
  tone,
  title,
  children,
}: {
  tone?: string
  title?: string
  children?: ReactNode
}): ReactNode {
  return createElement("em", { className: `badge badge-${tone}` }, children ?? title)
}

// ===========================================================================
// 7. HOST 2 — VUE
// ===========================================================================
//
// Distilled from examples/host-vue-demo/src/lib/plugin/{usePluginContext.ts,
// PluginHost.vue, ComponentRenderer.vue}. Written with `defineComponent` +
// `h()` instead of `.vue` SFCs because `learn/` has no SFC compiler; `h()` is
// exactly what the SFC's `<template>` compiles to, and the real
// `ComponentRenderer.vue` is already written in `h()` anyway — its template is
// one line: `<component :is="renderedNode" />`.

// --- 7a. the context mechanism ---------------------------------------------
//
// Vue's answer: an `InjectionKey` — a Symbol, not a component — plus `provide`
// in an ancestor's `setup()` and `inject` in a descendant's. Same job as
// React's context object; nothing about it is a component, which is why the Vue
// adapter can do its recursion with a plain function (7c).

interface VuePluginContextValue {
  controller: PluginController
  registry: ComponentRegistry<VueComponent>
}

const PluginContextKey: InjectionKey<VuePluginContextValue> = Symbol("uniview:plugin")

const vueInstrumentation = newInstrumentation()

function useVuePluginContext(): VuePluginContextValue {
  const context = inject(PluginContextKey)
  vueInstrumentation.contextReads++ // teaching only
  if (!context) {
    // The same sentence as React's, in a different framework, in a different
    // repository directory. Two people solving the same problem.
    throw new Error("usePluginContext must be used within a PluginHost")
  }
  return context
}

// --- 7b. JOB 2, Vue spelling ------------------------------------------------

interface VueTransformedProps {
  attrs: Record<string, unknown>
  onClick?: EventHandler
  onInput?: EventHandler
  onChange?: EventHandler
  onKeydown?: EventHandler
}

/**
 * Same loop, same order, same `continue`. Two differences, both purely about
 * how Vue spells things:
 *
 *   - `className` -> `attrs.class`, `htmlFor` -> `attrs.for` (Vue vnode props
 *     are the HTML attribute names, not the DOM property names).
 *   - the event field is `onKeydown`, not `onKeyDown`. Vue's DOM event props
 *     are `on` + the event name with only the first letter capitalised, and the
 *     DOM event is `keydown`. React's synthetic events are camelCased through:
 *     `onKeyDown`. The PROTOCOL's name stays `onKeyDown` in both; the mapping
 *     is the adapter's problem, which is exactly why it is in the adapter.
 */
function vueTransformProps(
  nodeProps: Record<string, JSONValue>,
  createHandler: (handlerId: string, eventName: EventPropName) => EventHandler,
): VueTransformedProps {
  const attrs: Record<string, unknown> = {}
  const result: VueTransformedProps = { attrs }

  for (const [key, value] of Object.entries(nodeProps)) {
    if (key === "children" || key === "key") continue

    if (isHandlerIdProp(key)) {
      const eventName = extractEventName(key)
      if (eventName && typeof value === "string") {
        const handler = createHandler(value, eventName)
        if (eventName === "onChange") {
          result.onInput = handler
          result.onChange = handler
        } else if (eventName === "onInput") {
          result.onInput = handler
        } else if (eventName === "onClick") {
          result.onClick = handler
        } else if (eventName === "onKeyDown") {
          result.onKeydown = handler
        }
      }
      continue
    }

    if (key === "className") {
      attrs.class = value
    } else if (key === "htmlFor") {
      attrs.for = value
    } else {
      attrs[key] = value
    }
  }

  return result
}

const vueWithoutEvent = (handler?: EventHandler): (() => void) | undefined => {
  if (!handler) return undefined
  return () => {
    void handler()
  }
}

/** React reads `currentTarget`; Vue reads `target`. Verbatim from both files. */
const vueWithInputValue = (
  handler?: EventHandler,
): ((event: { target: { value: string } }) => void) | undefined => {
  if (!handler) return undefined
  return (event) => {
    void handler(event.target.value)
  }
}

// --- 7c. JOBS 1 and 3: a recursive FUNCTION, not a recursive component -------

/**
 * The structural difference from React, and the one that surprises people: the
 * Vue adapter's recursion is a plain function returning `VNode`s. Only the
 * outermost node is a component at all. React cannot do this — a React
 * component must be a component to call `useContext` — but Vue's `inject`
 * happens once, in `setup`, and after that `renderNode` is just a function with
 * `controller` and `registry` in scope.
 *
 * Consequence you can see in the output: React's `ComponentRenderer` returns
 * the bare string for a text node, but Vue's `renderChildren` wraps every
 * string child in `h("span", { key: index }, rendered)` — because it is
 * assembling a `VNode[]` and gives every entry a key. Printed section 2 shows
 * those spans; printed section 3 normalizes them away.
 */
const VueComponentRenderer = defineComponent({
  name: "ComponentRenderer",
  props: {
    node: {
      type: [Object, String] as PropType<UINode | string>,
      required: true,
    },
  },
  setup(props) {
    const { controller, registry } = useVuePluginContext()

    function createHandler(handlerId: string, eventName: EventPropName): EventHandler {
      const handler: EventHandler = async (...args: unknown[]) => {
        await controller.executeHandler(handlerId, args as JSONValue[])
      }
      vueInstrumentation.handlers.push({ handlerId, eventName, call: handler }) // teaching only
      return handler
    }

    function renderNode(node: UINode | string): VNode | string {
      if (typeof node === "string") return node
      if (node.type === TEXT_NODE_TYPE) return node.text ?? ""

      const { type, props: nodeProps, children } = node
      const p = vueTransformProps(nodeProps, createHandler)

      const renderChildren = (): VNode[] =>
        children.map((child, index) => {
          const rendered = renderNode(child)
          return typeof rendered === "string"
            ? h("span", { key: index }, rendered)
            : rendered
        })

      if (type === "button") {
        return h(
          "button",
          {
            class: `cursor-pointer ${p.attrs.class || ""}`,
            ...p.attrs,
            onClick: vueWithoutEvent(p.onClick),
          },
          renderChildren(),
        )
      }

      if (type === "input") {
        return h("input", {
          ...p.attrs,
          onInput: vueWithInputValue(p.onInput),
          onChange: vueWithInputValue(p.onChange),
        })
      }

      if (isLayoutTag(type)) {
        if (VOID_ELEMENTS.includes(type)) return h(type, p.attrs)
        return h(type, p.attrs, renderChildren())
      }

      // JOB 3, registry hit. Children go in as a SLOTS OBJECT — `{ default: () =>
      // [...] }` — not as a third positional argument. This is the deepest
      // adapter-specific difference in the whole file: React hands a component
      // its children as varargs, Vue hands it a record of named thunks, and
      // Svelte writes them between the component's tags.
      if (registry?.has(type)) {
        const RegisteredComponent = registry.get(type) as VueComponent
        const textChildren = children.map((child) => textContent(child) ?? "").join("")
        const nonTextChildren = children.filter(
          (child) => textContent(child) === null,
        ) as UINode[]

        const componentProps = {
          ...p.attrs,
          title: textChildren || p.attrs.title,
          onClick: p.onClick,
          onInput: p.onInput,
          onChange: p.onChange,
          onKeydown: p.onKeydown,
        }

        if (nonTextChildren.length > 0 || textChildren) {
          return h(RegisteredComponent, componentProps, {
            default: () => [
              textChildren,
              ...nonTextChildren.map((child, index) => {
                const rendered = renderNode(child)
                return typeof rendered === "string"
                  ? h("span", { key: index }, rendered)
                  : rendered
              }),
            ],
          })
        }
        return h(RegisteredComponent, componentProps)
      }

      return h("div", { class: "uniview-unknown" }, `Unknown: ${type}`)
    }

    const renderedNode = computed((): VNode => {
      const result = renderNode(props.node)
      return typeof result === "string" ? h("span", {}, result) : result
    })

    return () => renderedNode.value
  },
})

/**
 * The Vue host component. The real one subscribes in a `watch(..., {immediate:
 * true})` and cleans up in `onUnmounted`; as with React, the subscription lives
 * in the driver here. The `provide` call is copied exactly, GETTERS AND ALL:
 * the real file provides `{ get controller() { return props.controller } }` so
 * that swapping the controller prop (worker -> websocket -> main) re-resolves
 * for every descendant without re-providing.
 */
const VuePluginHost = defineComponent({
  name: "PluginHost",
  props: {
    controller: { type: Object as PropType<PluginController>, required: true },
    registry: {
      type: Object as PropType<ComponentRegistry<VueComponent>>,
      required: true,
    },
    tree: { type: Object as PropType<UINode | null>, default: null },
  },
  setup(props) {
    provide(PluginContextKey, {
      get controller() {
        return props.controller
      },
      get registry() {
        return props.registry
      },
    })
    return () =>
      props.tree
        ? h(VueComponentRenderer, { node: props.tree })
        : h("div", null, "Loading...")
  },
})

// --- 7d. the same product primitive, in Vue ---------------------------------
//
// `props: ["tone", "title"]` is not decoration: anything NOT declared here
// becomes a fallthrough attribute and would be rendered onto `<em>`. React has
// no equivalent — an unused prop is simply unused. One more adapter-specific
// obligation the protocol knows nothing about.

const VueBadge = defineComponent({
  name: "Badge",
  props: { tone: { type: String, default: "" }, title: { type: String, default: "" } },
  setup(props, { slots }) {
    return () =>
      h("em", { class: `badge badge-${props.tone}` }, slots.default?.() ?? props.title)
  },
})

// ===========================================================================
// 8. The driver: one controller, one tree, two hosts
// ===========================================================================

const controller = new ScriptedController(buildTree)

const reactRegistry = createComponentRegistry<ComponentType>()
reactRegistry.register("Badge", ReactBadge, { version: "1.0.0" })

const vueRegistry = createComponentRegistry<VueComponent>()
vueRegistry.register("Badge", VueBadge, { version: "1.0.0" })

/** React SSR is synchronous. This is the whole React host, invoked. */
function renderReact(tree: UINode | null): string {
  return renderToStaticMarkup(
    createElement(ReactPluginHost, { controller, registry: reactRegistry, tree }),
  )
}

/** Vue SSR is asynchronous. Same host, same tree, one `await` of difference. */
async function renderVue(tree: UINode | null): Promise<string> {
  const app = createSSRApp(VuePluginHost, { controller, registry: vueRegistry, tree })
  // Vue routes render-time exceptions through its warn channel too; printed
  // section 4 deliberately triggers one, and this keeps the output free of
  // Vue's own stack traces. Nothing about the adapter changes.
  app.config.warnHandler = () => {}
  return await renderToString(app)
}

// The subscription the two `PluginHost` components own in a browser. Server
// rendering has no reactivity: `setTree(newTree)` / `tree.value = newTree`
// become "render again", so the driver holds the latest tree instead.
const hostState: { latestTree: UINode | null } = { latestTree: null }
const unsubscribe = controller.subscribe((tree) => {
  hostState.latestTree = tree
})

await controller.connect()

// ---------------------------------------------------------------------------
// 9. Printing helpers
// ---------------------------------------------------------------------------

/** Indented tag-per-line, so two HTML strings can be read side by side. */
function prettyHtml(html: string): string[] {
  const tokens = html.split(/(<[^>]+>)/).filter((t) => t.length > 0)
  const out: string[] = []
  let depth = 0
  for (const token of tokens) {
    if (token.startsWith("</")) {
      depth = Math.max(0, depth - 1)
      out.push("  ".repeat(depth) + token)
    } else if (token.startsWith("<")) {
      const selfClosing =
        token.endsWith("/>") || VOID_ELEMENTS.some((v) => token.startsWith(`<${v}`))
      out.push("  ".repeat(depth) + token)
      if (!selfClosing) depth++
    } else {
      out.push("  ".repeat(depth) + token)
    }
  }
  return out
}

function sideBySide(
  left: { title: string; lines: string[] },
  right: { title: string; lines: string[] },
): string {
  const width = Math.max(left.title.length, ...left.lines.map((l) => l.length)) + 3
  const rows = Math.max(left.lines.length, right.lines.length)
  const out = [
    left.title.padEnd(width) + right.title,
    "-".repeat(left.title.length).padEnd(width) + "-".repeat(right.title.length),
  ]
  for (let i = 0; i < rows; i++) {
    out.push((left.lines[i] ?? "").padEnd(width) + (right.lines[i] ?? ""))
  }
  return out.map((l) => "  " + l.trimEnd()).join("\n")
}

function showTree(node: UINode | string, depth = 0): string {
  const pad = "  ".repeat(depth)
  if (typeof node === "string") return `${pad}"${node}" (legacy bare string)`
  if (node.type === TEXT_NODE_TYPE) return `${pad}#text#${node.id} "${node.text}"`
  const props = Object.entries(node.props)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ")
  const kind = isLayoutTag(node.type) ? "layout tag" : "product primitive"
  return [
    `${pad}<${node.type}#${node.id}${props ? " " + props : ""}>  // ${kind}`,
    ...node.children.map((c) => showTree(c, depth + 1)),
  ].join("\n")
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  )
  const line = (cells: string[]): string =>
    "  " + cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ").trimEnd()
  return [
    line(headers),
    "  " + widths.map((w) => "-".repeat(w)).join("  "),
    ...rows.map(line),
  ].join("\n")
}

// ---------------------------------------------------------------------------
// 10. Run it
// ---------------------------------------------------------------------------

console.log("=== 1. The ONE tree, straight off the controller ===\n")
console.log(
  showTree(hostState.latestTree as UINode)
    .split("\n")
    .map((l) => "    " + l)
    .join("\n"),
)

const react1 = renderReact(hostState.latestTree)
const vue1 = await renderVue(hostState.latestTree)

console.log("\n=== 2. Two real hosts, rendered ===\n")
console.log(
  sideBySide(
    { title: "REACT  (react-dom/server)", lines: prettyHtml(react1) },
    { title: "VUE  (vue/server-renderer)", lines: prettyHtml(vue1) },
  ),
)

// --- the normalized comparison ---------------------------------------------
//
// Three normalizations, one per real per-framework artefact — NOT one per
// difference of substance. If a fourth were needed, the two adapters would
// genuinely disagree about the tree.
function normalize(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "") // framework comment anchors, if any
    .replace(/<span>([^<]*)<\/span>/g, "$1") // Vue's keyed text-child wrapper
    .replace(/\s*\/>/g, ">") // React self-closes void tags; Vue does not
    .replace(/\s+/g, " ")
    .trim()
}

const normReact = normalize(react1)
const normVue = normalize(vue1)

console.log("\n=== 3. Normalized: same tree, two frameworks, two adapters ===\n")
console.log(`  react bytes raw / normalized : ${react1.length} / ${normReact.length}`)
console.log(`  vue   bytes raw / normalized : ${vue1.length} / ${normVue.length}`)
console.log(`  normalizations applied       : comments, Vue's <span> text wrapper,`)
console.log(`                                 React's self-closing void tags`)
console.log(`\n  IDENTICAL AFTER NORMALIZATION: ${normReact === normVue}\n`)
console.log(`  ${normReact}`)
if (normReact !== normVue) {
  console.log(`  vue differs:\n  ${normVue}`)
}

// --- the context mechanism --------------------------------------------------

console.log("\n=== 4. How the controller reached node #14 ===\n")
console.log(
  table(
    ["", "React", "Vue"],
    [
      ["mechanism", "createContext() object", "InjectionKey (a Symbol)"],
      ["publish", "<Context.Provider value>", "provide(key, value) in setup()"],
      ["consume", "useContext(Context)", "inject(key)"],
      ["scope", "per React element subtree", "per component instance tree"],
      [
        "reads during render",
        String(reactInstrumentation.contextReads),
        String(vueInstrumentation.contextReads),
      ],
    ],
  ),
)
console.log(
  "\n  React reads context once per NODE — every recursion is a new component\n" +
    "  instance, so `useContext` runs again. Vue reads it once per COMPONENT,\n" +
    "  and its recursion is a plain function inside one `setup()`. Same\n" +
    "  guarantee, two costs.\n" +
    "\n  Neither `ComponentRenderer` takes a `controller` prop. That is the point:\n" +
    "  prop-threading a controller through an arbitrarily deep tree would put\n" +
    "  the transport in the signature of every node.",
)

// Both real files throw the same sentence when the renderer is used outside a
// host. Trigger it in both, so it is a fact and not a claim.
let reactGuard = "(did not throw)"
try {
  renderToStaticMarkup(createElement(ReactComponentRenderer, { node: hostState.latestTree! }))
} catch (error) {
  reactGuard = (error as Error).message
}

let vueGuard = "(did not throw)"
try {
  const orphan = createSSRApp(VueComponentRenderer, { node: hostState.latestTree! })
  orphan.config.warnHandler = () => {}
  await renderToString(orphan)
} catch (error) {
  vueGuard = (error as Error).message
}

console.log(`\n  renderer used outside a PluginHost:`)
console.log(`    react -> ${reactGuard}`)
console.log(`    vue   -> ${vueGuard}`)
console.log(`    same sentence, two independently written files: ${reactGuard === vueGuard}`)

// --- the differences that are real ------------------------------------------

console.log("\n=== 5. What is adapter-specific (differences actually hit here) ===\n")
console.log(
  table(
    ["dimension", "React", "Vue", "Svelte (step 08)"],
    [
      ["context", "createContext/useContext", "provide/inject + Symbol", 'setContext("uniview:controller")'],
      ["class attr", "attrs.className = v", "attrs.class = v", "attrs.class = v"],
      ["label attr", "attrs.htmlFor = v", "attrs.for = v", "attrs.for = v"],
      ["click field", "onClick", "onClick", "onclick"],
      ["keydown field", "onKeyDown", "onKeydown", "onkeydown"],
      ["event binding", "prop on the element", "prop on the vnode", "use:attachEvents action"],
      ["input value from", "event.currentTarget", "event.target", "serializeHandlerArgs(e)"],
      ["element children", "3rd arg, array + key", "3rd arg, VNode[] + key", "{#each} + <Self>"],
      ["component children", "varargs to createElement", "slots: {default: () => []}", "slot between tags"],
      ["text child", "returned as a bare string", 'wrapped in h("span",{key})', "rendered by <Self>"],
      ["recursion is", "the component itself", "a function in setup()", "Self, self-imported"],
      ["non-DOM handler id", "dropped", "dropped", "passed through as attr"],
      ["void tag output", "<input ... />", "<input ...>", "<input ...>"],
    ],
  ),
)
console.log(
  "\n  Every row is spelling or calling convention. Not one of them is a\n" +
    "  disagreement about the TREE — which is why section 3 could normalize\n" +
    "  three artefacts away and get byte equality.",
)

// --- the same handler, from both hosts --------------------------------------

console.log("\n=== 6. Firing a handler through each host ===\n")

const reactClick = reactInstrumentation.handlers.find((x) => x.handlerId === "h_click")!
const vueClick = vueInstrumentation.handlers.find((x) => x.handlerId === "h_click")!
const reactInput = reactInstrumentation.handlers.find((x) => x.handlerId === "h_input")!
const vueInput = vueInstrumentation.handlers.find((x) => x.handlerId === "h_input")!

console.log(`  callbacks built from handler ids during one render:`)
console.log(
  `    react ${reactInstrumentation.handlers.length}  [` +
    `${reactInstrumentation.handlers.map((x) => `${x.eventName}->${x.handlerId}`).join(", ")}]`,
)
console.log(
  `    vue   ${vueInstrumentation.handlers.length}  [` +
    `${vueInstrumentation.handlers.map((x) => `${x.eventName}->${x.handlerId}`).join(", ")}]`,
)

// Fire the callbacks the way each framework's element would: through the
// adapter's own event-shape wrapper. `withoutEvent` is fire-and-forget (it
// returns void, because that is what a DOM listener returns), so the driver
// yields a tick before reading the log.
reactWithoutEvent(reactClick.call)!()
await new Promise((resolve) => setTimeout(resolve, 0))
console.log(`\n  react button onClick -> ${JSON.stringify(controller.calls.at(-1))}`)

vueWithoutEvent(vueClick.call)!()
await new Promise((resolve) => setTimeout(resolve, 0))
console.log(`  vue   button onClick -> ${JSON.stringify(controller.calls.at(-1))}`)

reactWithInputValue(reactInput.call)!(
  fakeInputEvent("from react") as { currentTarget: { value: string } },
)
await new Promise((resolve) => setTimeout(resolve, 0))
console.log(`  react input  onInput -> ${JSON.stringify(controller.calls.at(-1))}`)

vueWithInputValue(vueInput.call)!(
  fakeInputEvent("from vue") as { target: { value: string } },
)
await new Promise((resolve) => setTimeout(resolve, 0))
console.log(`  vue   input  onInput -> ${JSON.stringify(controller.calls.at(-1))}`)

console.log(
  `\n  the plugin's state after four events: clicks=${controller.clicks} note=${JSON.stringify(controller.note)}`,
)
console.log(
  `  every call went to the same method: controller.executeHandler(id, args)\n` +
    `  neither host mutated the tree; the plugin did, and pushed a new one.`,
)

// --- re-render, from the tree the plugin pushed back ------------------------

const react2 = renderReact(hostState.latestTree)
const vue2 = await renderVue(hostState.latestTree)

/** The two lines the four events moved, in each rendering. */
const changed = (line: string): boolean => /Clicked \d|from vue/.test(line)

console.log("\n=== 7. Re-rendered from the tree those events produced ===\n")
console.log(
  sideBySide(
    { title: "REACT (text lines only)", lines: prettyHtml(react2).filter(changed) },
    { title: "VUE (text lines only)", lines: prettyHtml(vue2).filter(changed) },
  ),
)
console.log(`\n  identical after normalization: ${normalize(react2) === normalize(vue2)}`)
console.log(
  `  Two clicks: one from a React listener, one from a Vue listener, into one\n` +
    `  plugin. Both hosts then render the same count, because there is one\n` +
    `  source of truth and it is not in either host.`,
)

// --- the three jobs, and what was actually shared ---------------------------

unsubscribe()
await controller.destroy()

const reactFns: Function[] = [
  ReactComponentRenderer,
  reactTransformProps,
  reactWithoutEvent,
  reactWithInputValue,
  useReactPluginContext,
  ReactPluginHost,
]
const vueFns: Function[] = [
  vueTransformProps,
  vueWithoutEvent,
  vueWithInputValue,
  useVuePluginContext,
]
const protocolFns: Function[] = [isHandlerIdProp, extractEventName, textContent, isLayoutTag]

console.log("\n=== 8. The three jobs, in both adapters ===\n")
console.log(
  table(
    ["job", "React", "Vue"],
    [
      ["1. recurse", "ComponentRenderer (component)", "renderNode (function in setup)"],
      ["2. transform props", reactTransformProps.name, vueTransformProps.name],
      ["   handler id -> fn", "createHandler (in component)", "createHandler (in setup)"],
      ["3. resolve type", "isLayoutTag / registry.get", "isLayoutTag / registry.get"],
      ["   fallback", '"Unknown: " + type', '"Unknown: " + type'],
    ],
  ),
)
console.log(
  `\n  adapter functions: react ${reactFns.length}, vue ${vueFns.length}\n` +
    `    shared implementations : ${reactFns.filter((f) => vueFns.includes(f)).length}\n` +
    `    shared with protocol   : ${protocolFns.length}  [${protocolFns.map((f) => f.name).join(", ")}]`,
)
console.log(
  `\n  That is the whole answer to "what is shared". Not code — a contract:\n` +
    `  UINode, the handler-id convention, LAYOUT_TAGS, TEXT_NODE_TYPE, and the\n` +
    `  four protocol helpers above. Everything else was written twice, on\n` +
    `  purpose, in each framework's own idiom.\n` +
    `\n  To write the fourth host: recurse, transform props, resolve type. Two\n` +
    `  hundred lines. Step 10 does it in Swift, where there is no JS at all.`,
)
