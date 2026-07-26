/**
 * Step 13 — the plugin on another thread: crossing a structured-clone boundary.
 *
 * Step 12 was implementation #1 of `PluginController`, the one with nothing in
 * the middle: the plugin's React tree lived in the host's heap, `postMessage` was
 * never called, and `executeHandler` reached the plugin's closure by a direct
 * call on the host's own stack — a fact step 12 proved by printing that stack.
 * It ended with a table of zeros and a promise: "step 13 replaces `cross()` with
 * structured clone and the same table is printed again with numbers in it".
 *
 * This is that step, and the numbers are not simulated. `main.ts` runs on the
 * main thread; `plugin-worker.ts` runs on a real `node:worker_threads` worker;
 * the React plugin genuinely mounts over there and its `UINode`s genuinely
 * arrive here by structured clone. Every microsecond and every byte printed
 * below was measured on that boundary during this run.
 *
 * FOUR THINGS THIS STEP TEACHES, in the order it prints them.
 *
 *   1. A FUNCTION CANNOT CROSS. Section 3 takes a `UINode`-shaped object with an
 *      `onClick: () => {}` in its props and posts it at the very worker the
 *      plugin is running on. The structured-clone algorithm refuses, out loud,
 *      with a real `DataCloneError`. Then the same node with step 04's
 *      `_onClickHandlerId: "node-24:onClick"` in place of the function makes the
 *      identical trip and comes back intact. Step 04 introduced handler ids as a
 *      design choice and step 12 noted that the main thread never tests it. This
 *      is the test. `HandlerId = string`, in `packages/protocol/src/events.ts`,
 *      is a one-word answer to a question the boundary asks with an exception.
 *
 *   2. THE PLUGIN IS SOMEWHERE ELSE. It has its own heap (a global the host set
 *      before connecting is `undefined` over there), its own stack (step 12's
 *      stack probe found the host's `dispatchHostEvent` frame; the same probe
 *      here cannot, and the run prints the worker's real stack so you can see
 *      what is on it instead), and its own event loop. `executeHandler` is no
 *      longer a call, it is a message; nothing about it can be synchronous.
 *
 *   3. THE ROUND TRIP, PRICED. Section 4 extends step 12's boundary table with a
 *      real Web-Worker-class row: real bytes in Node's structured-clone wire
 *      format, real stringify count (zero — structured clone is not JSON), and a
 *      real one-way thread-crossing time. It also prints every RPC message this
 *      run put on the wire, by method, with its size.
 *
 *   4. WHAT THE BOUNDARY BOUGHT. Section 5 clicks a button whose handler blocks
 *      its thread for 150 ms and counts the host's timer ticks while it runs —
 *      then runs the identical loop on the main thread and counts again. In step
 *      12 that plugin froze the host. Here it freezes a thread the host is not on.
 *      That is the entire reason to pay sections 3 and 4.
 *
 * ONE DEVIATION FROM THE REAL SOURCE, stated up front because it is the kind of
 * thing a curriculum must not hide. `packages/host-sdk/src/controllers/worker.ts`
 * calls `workerTransport(worker)` on a browser `Worker`, which is an EventTarget.
 * `node:worker_threads`'s `Worker` is an EventEmitter and has no
 * `addEventListener`, so section 4 wraps it in a nine-line shim that maps
 * `addEventListener("message", l)` onto `worker.on("message", …)`. kkrpc, the
 * `RPCChannel`, both proxied interfaces, `postMessage`, the structured-clone
 * boundary and the second thread are all the real thing; only that adapter is
 * this file's. The plugin side needed no shim at all — Node's `parentPort` is
 * already the `WorkerScopeLike` shape kkrpc asks for.
 */

import { Worker } from "node:worker_threads"
import { serialize as v8Serialize } from "node:v8"
import { RPCChannel } from "kkrpc"
import type { RPCMessage, Transport } from "kkrpc"
import { workerTransport } from "kkrpc/worker"
import type {
  AppendChildMutation,
  HandlerId,
  Hop,
  HostToPluginAPI,
  InsertBeforeMutation,
  JSONValue,
  Mutation,
  PluginToHostAPI,
  RemoveChildMutation,
  SetPropsMutation,
  SetTextMutation,
  UINode,
} from "./protocol.ts"
import {
  PROTOCOL_VERSION,
  TEXT_NODE_TYPE,
  countNodes,
  isHandlerIdProp,
  nativeStringify,
  show,
  utf8,
} from "./protocol.ts"

// ===========================================================================
// 1. The instruments — step 12's, pointed at a boundary that is now real
// ===========================================================================
//
// Step 12 measured a seam that did nothing, so its instrument could be a class
// with an `if`. This one measures messages leaving and entering a thread, so it
// hooks the transport: every `send` and every received message is weighed on the
// way past. Nothing here is guessed and nothing is a proxy for something else —
// except where the code says so, once, about `v8.serialize`.

let stringifyArmed = false
let stringifyCalls = 0

/**
 * Global `JSON.stringify` counter, carried forward from step 12 §2 so that the
 * "stringify calls" column of the baseline table is filled in by the same
 * instrument on both pages. The interesting result this step gets from it is a
 * zero: a Worker moves objects, not text. Step 14's row is where it stops being
 * zero.
 */
JSON.stringify = ((value: unknown, replacer?: unknown, space?: unknown): string => {
  if (stringifyArmed) stringifyCalls += 1
  return (nativeStringify as (v: unknown, r?: unknown, s?: unknown) => string)(
    value,
    replacer,
    space,
  )
}) as typeof JSON.stringify

function measureStringify<T>(fn: () => T): { result: T; calls: number } {
  const before = stringifyCalls
  stringifyArmed = true
  try {
    const result = fn()
    return { result, calls: stringifyCalls - before }
  } finally {
    stringifyArmed = false
  }
}

/** One message that actually crossed, weighed both ways. */
interface WireRecord {
  dir: "host -> plugin" | "plugin -> host"
  method: string
  /** Bytes in Node's structured-clone wire format — see `cloneBytes` below. */
  cloneBytes: number
  /** Bytes the same message would be as UTF-8 JSON — step 12's and step 14's unit. */
  jsonBytes: number
}

/**
 * `v8.serialize` is the HTML structured-clone algorithm's Node implementation —
 * the same serializer `port.postMessage` uses to move a value between threads.
 * It is therefore a real measurement of the real format, not a stand-in.
 *
 * It is worth being precise about what "bytes" means here, because a Web Worker
 * has no wire: the two threads share an address space, and a large `ArrayBuffer`
 * can be transferred rather than copied. The clone still has to be BUILT, and
 * these bytes are what has to be built. Step 12 approximated this row with a
 * JSON byte count (1786 B); both numbers are printed side by side in section 4
 * so you can see how good that approximation was.
 */
const cloneBytes = (value: unknown): number => v8Serialize(value).byteLength

class WireMeter {
  records: WireRecord[] = []

  add(record: WireRecord): void {
    this.records.push(record)
  }

  total(dir?: WireRecord["dir"]): { messages: number; clone: number; json: number } {
    const rows = dir ? this.records.filter((r) => r.dir === dir) : this.records
    return {
      messages: rows.length,
      clone: rows.reduce((n, r) => n + r.cloneBytes, 0),
      json: rows.reduce((n, r) => n + r.jsonBytes, 0),
    }
  }

  /** The last message of a given method — how big one real payload really was. */
  last(method: string): WireRecord | undefined {
    return [...this.records].reverse().find((r) => r.method === method)
  }
}

/** Teaching apparatus: the cross-thread hop recorder, step 12's format. */
let hops: Hop[] | null = null

function hop(where: Hop["where"], what: string, t = performance.now()): void {
  if (hops !== null) hops.push({ t, where, what })
}

/**
 * The transport wrapper. kkrpc's `Transport` is three members — `send`,
 * `subscribe`, `close` — which is exactly why it can be wrapped: everything that
 * crosses the boundary crosses here, in both directions, and the host can weigh
 * it without either side knowing.
 *
 * kkrpc's request record is `{t:"q", id, op, p:["executeHandler"], a:[…]}` and
 * its reply is `{t:"r", id, v}`, so the method name is on the request and has to
 * be remembered to attribute the reply. That bookkeeping is the `pending` Map.
 */
function meteredTransport(inner: Transport<RPCMessage>, meter: WireMeter): Transport<RPCMessage> {
  const pending = new Map<string, string>()

  const describe = (message: RPCMessage): string => {
    const record = message as { t?: string; id?: string; p?: string[] }
    if (record.t === "q") {
      const method = record.p?.join(".") ?? "(call)"
      if (record.id) pending.set(record.id, method)
      return method
    }
    if (record.t === "r") {
      const method = record.id ? pending.get(record.id) : undefined
      if (record.id) pending.delete(record.id)
      return `${method ?? "?"} (reply)`
    }
    return `(${record.t ?? "?"})`
  }

  return {
    capabilities: inner.capabilities,
    send(message, transfers) {
      const method = describe(message)
      meter.add({
        dir: "host -> plugin",
        method,
        cloneBytes: cloneBytes(message),
        jsonBytes: utf8(nativeStringify(message)),
      })
      // `log` is the channel this file's own trace rides on; tracing its arrival
      // would be tracing the tracer.
      if (!method.startsWith("log")) hop("wire", `-> ${method} posted (structured clone)`)
      return inner.send(message, transfers)
    },
    subscribe(listener) {
      return inner.subscribe((message) => {
        const method = describe(message)
        meter.add({
          dir: "plugin -> host",
          method,
          cloneBytes: cloneBytes(message),
          jsonBytes: utf8(nativeStringify(message)),
        })
        if (!method.startsWith("log")) hop("wire", `<- ${method} arrived on the main thread`)
        listener(message)
      })
    },
    close() {
      inner.close?.()
    },
  }
}

/**
 * `node:worker_threads`'s `Worker` is an EventEmitter; kkrpc's `workerTransport`
 * wants the browser's EventTarget shape. This is the whole adapter, and it is
 * the only part of the transport stack this file invents.
 */
function nodeWorkerTarget(worker: Worker): {
  postMessage(message: unknown, transfer?: unknown[]): void
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void
  terminate(): void
} {
  const wrapped = new WeakMap<object, (value: unknown) => void>()
  return {
    postMessage(message, transfer) {
      // Structured clone happens INSIDE this call, on this thread, before the
      // message is handed to the other one. That is why section 3's failure is a
      // synchronous throw the host can catch, and not a silent drop.
      worker.postMessage(message, transfer as never)
    },
    addEventListener(_type, listener) {
      const forward = (value: unknown): void => listener({ data: value })
      wrapped.set(listener, forward)
      worker.on("message", forward)
    },
    removeEventListener(_type, listener) {
      const forward = wrapped.get(listener)
      if (forward) worker.off("message", forward)
    },
    terminate() {
      void worker.terminate().catch(() => {})
    },
  }
}

// ===========================================================================
// 2. Host side — MutableTree, carried forward from steps 02/12
// ===========================================================================
//
// Unchanged from step 12, and that is the point worth pausing on. In step 12
// `applyAppendChild` stored `mutation.node` BY REFERENCE and the host ended up
// holding the very object the plugin's collector built; `controller.getTree() ===
// hostTree` printed `true`. The code below is identical and that sentence is now
// false — not because the class changed, but because the object it is handed is
// a clone that structured clone minted on arrival. A data structure that only
// ever reads plain fields does not notice, which is why the protocol had to be
// plain fields.

class MutableTree {
  private tree: UINode | null = null
  private nodeIndex: Map<string, UINode> = new Map()
  private parentIndex: Map<string, string> = new Map()
  private readonly onError: (message: string) => void

  constructor(onError: (message: string) => void = (m) => console.error(m)) {
    this.onError = onError
  }

  init(tree: UINode | null): void {
    this.tree = tree
    this.rebuildIndex()
  }

  getTree(): UINode | null {
    return this.tree
  }

  applyMutations(mutations: Mutation[]): UINode | null {
    for (const mutation of mutations) this.applyMutation(mutation)
    return this.tree ? { ...this.tree } : null
  }

  private applyMutation(mutation: Mutation): void {
    switch (mutation.type) {
      case "setRoot":
        this.tree = mutation.node
        this.rebuildIndex()
        break
      case "appendChild":
        this.applyAppendChild(mutation)
        break
      case "insertBefore":
        this.applyInsertBefore(mutation)
        break
      case "removeChild":
        this.applyRemoveChild(mutation)
        break
      case "setText":
        this.applySetText(mutation)
        break
      case "setProps":
        this.applySetProps(mutation)
        break
    }
  }

  private rebuildIndex(): void {
    this.nodeIndex.clear()
    this.parentIndex.clear()
    if (this.tree) this.indexNode(this.tree, null)
  }

  private indexNode(node: UINode, parentId: string | null): void {
    this.nodeIndex.set(node.id, node)
    if (parentId !== null) this.parentIndex.set(node.id, parentId)
    else this.parentIndex.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") this.indexNode(child, node.id)
    }
  }

  private unindexNode(node: UINode): void {
    this.nodeIndex.delete(node.id)
    this.parentIndex.delete(node.id)
    for (const child of node.children) {
      if (typeof child !== "string") this.unindexNode(child)
    }
  }

  private replaceNode(targetId: string, newNode: UINode): void {
    this.nodeIndex.set(targetId, newNode)

    let childId = targetId
    let childNode = newNode
    while (this.tree && this.tree.id !== childId) {
      const parentId = this.parentIndex.get(childId)
      if (parentId === undefined) return
      const parent = this.nodeIndex.get(parentId)
      if (!parent) return

      const currentChildId = childId
      const newParent: UINode = {
        ...parent,
        children: parent.children.map((child) =>
          typeof child !== "string" && child.id === currentChildId ? childNode : child,
        ),
      }
      this.nodeIndex.set(parentId, newParent)
      childId = parentId
      childNode = newParent
    }

    if (this.tree && this.tree.id === childId) this.tree = childNode
  }

  private detachExistingNode(nodeId: string): void {
    const parentId = this.parentIndex.get(nodeId)
    if (parentId === undefined) return
    const parent = this.nodeIndex.get(parentId)
    if (!parent) return

    const newParent: UINode = {
      ...parent,
      children: parent.children.filter(
        (child) => typeof child === "string" || child.id !== nodeId,
      ),
    }
    this.parentIndex.delete(nodeId)
    this.replaceNode(parentId, newParent)
  }

  private applyAppendChild(mutation: AppendChildMutation): void {
    this.detachExistingNode(mutation.node.id)
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    const newParent: UINode = { ...parent, children: [...parent.children, mutation.node] }
    this.indexNode(mutation.node, mutation.parentId)
    this.replaceNode(mutation.parentId, newParent)
  }

  private applyInsertBefore(mutation: InsertBeforeMutation): void {
    this.detachExistingNode(mutation.node.id)
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    let insertIndex = -1
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i]
      if (typeof child !== "string" && child.id === mutation.beforeId) {
        insertIndex = i
        break
      }
    }
    if (insertIndex === -1) {
      this.onError(
        `[uniview] insertBefore anchor ${mutation.beforeId} not found under ` +
          `${mutation.parentId}; appending instead (tree state diverged)`,
      )
      insertIndex = parent.children.length
    }

    const newChildren = [...parent.children]
    newChildren.splice(insertIndex, 0, mutation.node)
    this.indexNode(mutation.node, mutation.parentId)
    this.replaceNode(mutation.parentId, { ...parent, children: newChildren })
  }

  private applyRemoveChild(mutation: RemoveChildMutation): void {
    const parent = this.nodeIndex.get(mutation.parentId)
    if (!parent) return

    const newChildren = parent.children.filter((child) => {
      if (typeof child === "string") return true
      if (child.id === mutation.nodeId) {
        this.unindexNode(child)
        return false
      }
      return true
    })
    this.replaceNode(mutation.parentId, { ...parent, children: newChildren })
  }

  private applySetText(mutation: SetTextMutation): void {
    const node = this.nodeIndex.get(mutation.nodeId)
    if (!node) {
      this.onError(`[uniview] setText target ${mutation.nodeId} not found (tree diverged)`)
      return
    }
    this.replaceNode(mutation.nodeId, { ...node, text: mutation.text })
  }

  private applySetProps(mutation: SetPropsMutation): void {
    const node = this.nodeIndex.get(mutation.nodeId)
    if (!node) return
    this.replaceNode(mutation.nodeId, { ...node, props: mutation.props })
  }
}

// ===========================================================================
// 3. The seam — packages/host-sdk/src/types.ts, unchanged since step 07
// ===========================================================================
//
// Ten members. Not one of them changes for this step, and that is the claim
// Stage D exists to make good on. Read `executeHandler` again now that the
// plugin is on another thread: the `Promise` that looked like ceremony in step
// 12 is the only honest signature this transport could have had.

export type HostMode = "worker" | "websocket" | "main"

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

// ===========================================================================
// 4. NEW — createWorkerController: the real file, distilled
// ===========================================================================
//
// `packages/host-sdk/src/controllers/worker.ts`, structure for structure: the
// same seven closure locals, the same `hostAPI` object literal exposed to the
// plugin, the same object literal returned as the `PluginController`, the same
// `initialize` handshake, the same three-step teardown (`api.destroy()`,
// `rpc.destroy()`, `worker.terminate()`).
//
// Two differences from the real file, both structural to `learn/` rather than to
// the design:
//
//   - The real `connect()` does `fetch(pluginUrl)` -> `new Blob([...])` ->
//     `URL.createObjectURL` -> `new Worker(blobURL, { type: "module" })`, because
//     a plugin is a script deployed somewhere else and downloaded at runtime.
//     Node has no blob-URL workers, so this passes a module URL straight to
//     `new Worker(...)`. What that hides is that a real plugin's CODE crosses a
//     boundary too, before any of its data does.
//   - `validate` / `validateIncomingTree` / `validateIncomingMutations` are
//     omitted; see the doc's "what this step leaves out".

export interface WorkerControllerOptions {
  /** Real signature: `pluginUrl: string`, fetched over HTTP. See above. */
  pluginUrl: URL
  initialProps?: JSONValue
  meter: WireMeter
  /** TEACHING KNOB, not upstream: section 6 uses it to fail the handshake. */
  protocolVersionOverride?: number
}

/**
 * The real factory returns exactly `PluginController`. The two extra members
 * here are this file's probes and are flagged everywhere they are used; a host
 * never gets them, and `worker.ts`'s own anti-pattern list is the reason
 * ("NEVER expose raw RPC channel - encapsulate entirely in controller").
 */
export interface WorkerControllerHandle extends PluginController {
  /** TEACHING ONLY: post a raw value at the real worker and report what the
   *  structured-clone algorithm said about it. */
  postRawToWorker(value: unknown): { ok: boolean; error: string }
  /** TEACHING ONLY: one measured crossing of a real payload. */
  echo(payload: JSONValue): Promise<{ oneWayMs: number; roundTripMs: number }>
}

export function createWorkerController(opts: WorkerControllerOptions): WorkerControllerHandle {
  const { pluginUrl, initialProps, meter, protocolVersionOverride } = opts

  let worker: Worker | null = null
  let rpc: RPCChannel<PluginToHostAPI, HostToPluginAPI> | null = null
  let tree: UINode | null = null
  let mutableTree = new MutableTree()
  let connected = false
  let lastError: string | undefined
  const subscribers = new Set<(tree: UINode | null) => void>()
  const errorSubscribers = new Set<(message: string) => void>()

  /**
   * The plugin's half of the conversation. Every member here is called BY THE
   * OTHER THREAD; none of them can return a value the plugin waits on, which is
   * why `PluginToHostAPI` declares them all `void`. Compare with step 12, where
   * this object did not need to exist because the plugin called `subscribers`
   * directly.
   */
  const hostAPI: PluginToHostAPI = {
    updateTree(newTree: UINode | null) {
      tree = newTree
      mutableTree.init(newTree)
      subscribers.forEach((cb) => void cb(tree))
    },
    applyMutations(mutations: Mutation[]) {
      tree = mutableTree.applyMutations(mutations)
      subscribers.forEach((cb) => void cb(tree))
    },
    log(level, args) {
      // The real body is `console[level]("[Plugin]", ...args)`. This one also
      // recognises the two teaching channels the worker rides on top of it.
      if (args[0] === "hop" && typeof args[2] === "string" && typeof args[3] === "number") {
        hop("plugin", args[2], args[3])
        return
      }
      if (args[0] === "probe" && typeof args[1] === "string") {
        probes.set(args[1], args[2] ?? null)
        return
      }
      console[level]("[Plugin]", ...args)
    },
    reportError(err) {
      lastError = err.message
      console.error("[Plugin Error]", err.message)
      errorSubscribers.forEach((cb) => void cb(err.message))
    },
  }

  return {
    async connect() {
      // `new Worker(url)` — the plugin's module is loaded, evaluated and started
      // on a thread of its own. Nothing of the host's heap goes with it.
      //
      // `execArgv` is the one concession to running TypeScript directly: a
      // worker thread does NOT inherit its parent's module loader, so without
      // passing it along Node loads `plugin-worker.ts` with its own strip-only
      // TypeScript support and fails on the first relative import lacking a
      // file extension. Step 14 does the same thing for its forked child. In a
      // browser — and in the real `createWorkerController` — the plugin is
      // already-built JavaScript and none of this applies.
      worker = new Worker(pluginUrl, { execArgv: process.execArgv })
      const transport = meteredTransport(
        workerTransport(nodeWorkerTarget(worker) as unknown as globalThis.Worker),
        meter,
      )
      rpc = new RPCChannel<PluginToHostAPI, HostToPluginAPI>(transport, { expose: hostAPI })

      connected = true
      lastError = undefined

      const api = rpc.getAPI()
      // THE HANDSHAKE. `createMainController` has no equivalent — step 12's doc
      // lists its absence under "what this step leaves out" — because there the
      // host and the plugin were one bundle. Here the plugin is a separate
      // module (in production, a separately deployed script), so the first
      // message on the channel asks whether the other end speaks this protocol.
      // A mismatch throws inside the worker and kkrpc turns that throw into a
      // rejection of this `await`. Section 6 does exactly that on purpose.
      await api.initialize({
        protocolVersion: protocolVersionOverride ?? PROTOCOL_VERSION,
        props: initialProps,
      })
    },

    async disconnect() {
      if (rpc) {
        try {
          const api = rpc.getAPI()
          await api.destroy()
        } catch {}
        rpc.destroy()
      }
      if (worker) {
        // Step 12's `disconnect()` had to `unmount(bridge)` by hand, and its
        // comment explains why: "in main-thread mode the plugin runs in the host
        // page — dropping references without unmounting leaked live
        // effects/timers directly into the host". Here one call throws the whole
        // global away: the React tree, the handler registry, the timers, the
        // leaked listeners, all of it. That asymmetry is the isolation, priced
        // in the other direction.
        await worker.terminate()
        worker = null
      }
      rpc = null
      connected = false
      tree = null
      mutableTree = new MutableTree()
    },

    async destroy() {
      await this.disconnect()
      subscribers.clear()
      errorSubscribers.clear()
    },

    async updateProps(props: JSONValue) {
      if (!rpc) return
      await rpc.getAPI().updateProps(props)
    },

    /** "Request plugin to send current full tree. Used for recovery from drift." */
    async syncTree(): Promise<void> {
      if (!connected || !rpc) return
      await rpc.getAPI().syncTree()
    },

    getTree() {
      return tree
    },

    subscribe(cb: (tree: UINode | null) => void) {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },

    subscribeErrors(cb: (message: string) => void) {
      errorSubscribers.add(cb)
      return () => {
        errorSubscribers.delete(cb)
      }
    },

    /**
     * The whole step, in one method. Step 12's body was
     * `await handlerRegistry.execute(handlerId, ...)` — a call into a Map in the
     * same heap. This one is `await api.executeHandler(handlerId, args)`, which
     * is: encode a record, structured-clone it onto another thread, wake that
     * thread, look the id up in ITS Map, run the closure there, let its mutations
     * come back as a separate message, and finally resolve this promise when the
     * reply arrives. Same signature. Same host code. Four orders of magnitude.
     */
    async executeHandler(handlerId: HandlerId, args?: JSONValue[]) {
      if (!rpc) return
      const api = rpc.getAPI()
      await api.executeHandler(handlerId, args ?? [])
    },

    getStatus(): { mode: HostMode; connected: boolean; lastError?: string } {
      return { mode: "worker", connected, ...(lastError !== undefined ? { lastError } : {}) }
    },

    // --- teaching probes, not part of PluginController ---------------------

    postRawToWorker(value: unknown) {
      if (!worker) return { ok: false, error: "not connected" }
      try {
        // The clone is built HERE, synchronously, before anything is delivered.
        worker.postMessage(value)
        return { ok: true, error: "" }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        }
      }
    },

    async echo(payload: JSONValue) {
      if (!rpc) return { oneWayMs: 0, roundTripMs: 0 }
      const sentAt = performance.now()
      const result = await rpc.getAPI().echo(payload, sentAt)
      const back = performance.now()
      return { oneWayMs: result.arrivedAt - sentAt, roundTripMs: back - sentAt }
    },
  }
}

/** Probe values the worker shipped over the `log` channel. */
const probes = new Map<string, JSONValue>()

// ===========================================================================
// 5. The host — step 07/08/12's outline host, unchanged
// ===========================================================================
//
// Byte for byte the host from step 12 §8, which was step 07's. It is unchanged
// on purpose: the point of the seam is that moving the plugin to another thread
// is not visible from up here. The only member that can tell is `getStatus()`,
// and all it says is `"worker"` instead of `"main"`.

interface ComponentMetadata {
  version?: string
}

interface ComponentRegistry<T = unknown> {
  register(type: string, component: T, metadata?: ComponentMetadata): void
  get(type: string): T | undefined
  has(type: string): boolean
  list(): string[]
  clear(): void
}

function createComponentRegistry<T>(): ComponentRegistry<T> {
  const entries = new Map<string, { component: T; metadata?: ComponentMetadata }>()
  return {
    register: (type, component, metadata) => void entries.set(type, { component, metadata }),
    get: (type) => entries.get(type)?.component,
    has: (type) => entries.has(type),
    list: () => Array.from(entries.keys()),
    clear: () => entries.clear(),
  }
}

const LAYOUT_TAGS = ["div", "span", "button", "input", "p", "ul", "li"] as const
type UILayoutTag = (typeof LAYOUT_TAGS)[number]
const isLayoutTag = (type: string): type is UILayoutTag =>
  (LAYOUT_TAGS as readonly string[]).includes(type)

const handlerEventName = (propKey: string): string | null => {
  const match = /^_on([A-Z][A-Za-z]*)HandlerId$/.exec(propKey)
  return match ? match[1].toLowerCase() : null
}

type OutlineComponent = (node: UINode, attrs: string, childLines: string[]) => string[]

interface OutlineHost {
  name: string
  registry: ComponentRegistry<OutlineComponent>
  render(tree: UINode | null): string[]
  bindings: Map<string, HandlerId>
  renders: number
}

function createOutlineHost(): OutlineHost {
  const registry = createComponentRegistry<OutlineComponent>()
  const bindings = new Map<string, HandlerId>()

  const container: OutlineComponent = (node, attrs, childLines) => [
    `<${node.type}${attrs}>`,
    ...childLines.map((l) => "  " + l),
    `</${node.type}>`,
  ]
  registry.register("column", container, { version: "1.0.0" })
  registry.register("row", container)
  registry.register("heading", container)
  registry.register("label", container)

  function serializeAttrs(node: UINode): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(node.props)) {
      const event = handlerEventName(key)
      if (event !== null) {
        // In step 12 this string named a function that was, physically, one
        // dereference away. Here it names a function in another thread's heap,
        // and the host's code for handling it did not change by one character.
        bindings.set(`${node.id} ${event}`, String(value))
        parts.push(`on:${event}=${nativeStringify(value)}`)
        continue
      }
      parts.push(`${key}=${nativeStringify(value)}`)
    }
    return parts.length > 0 ? " " + parts.join(" ") : ""
  }

  function renderNode(node: UINode | string): string[] {
    if (typeof node === "string") return [node]
    if (node.type === TEXT_NODE_TYPE) return [node.text ?? ""]

    const attrs = serializeAttrs(node)
    const childLines = node.children.flatMap(renderNode)

    if (isLayoutTag(node.type)) {
      if (childLines.length === 0) return [`<${node.type}${attrs} />`]
      return [`<${node.type}${attrs}>`, ...childLines.map((l) => "  " + l), `</${node.type}>`]
    }

    const component = registry.get(node.type)
    if (component) return component(node, attrs, childLines)
    return [`Unknown: ${node.type}`]
  }

  const host: OutlineHost = {
    name: "outline host (string tree, recursive)",
    registry,
    bindings,
    renders: 0,
    render(tree) {
      host.renders += 1
      bindings.clear()
      return tree ? renderNode(tree) : ["(no tree)"]
    },
  }
  return host
}

/**
 * Step 12 made this a named top-level function so its frame could be found in a
 * stack captured inside the plugin's closure. It is still named, for the same
 * reason and the opposite result.
 */
async function dispatchHostEvent(
  controller: PluginController,
  handlerId: HandlerId,
  args: JSONValue[] = [],
): Promise<void> {
  await controller.executeHandler(handlerId, args)
}

// ===========================================================================
// 6. Run it
// ===========================================================================

const pad = (s: string | number, n: number): string => String(s).padStart(n)
const line = (s: string, n = 74): string => s + " ".repeat(Math.max(0, n - s.length))

const PLUGIN_URL = new URL("./plugin-worker.ts", import.meta.url)

/**
 * A global on the HOST's global object, set before the plugin is ever started.
 * A main-thread plugin would read it without trying. Section 2 asks the plugin
 * what it sees.
 */
;(globalThis as { __hostSecret?: string }).__hostSecret = "host-only"

// --- 6.1 connect: the handshake, and a tree that arrived by clone ----------

console.log("=== 1. connect(): a handshake, then a React tree from another thread ===")

const meter = new WireMeter()
const host = createOutlineHost()
const controller = createWorkerController({
  pluginUrl: PLUGIN_URL,
  initialProps: { title: "Open tickets" },
  meter,
})

let hostLines: string[] = []
let hostTree: UINode | null = null
let hostRenders = 0

const unsubscribe = controller.subscribe((tree) => {
  hop("host", "subscriber fires -> host re-renders")
  hostRenders += 1
  hostTree = tree
  hostLines = host.render(tree)
})

console.log(`  before connect: ${nativeStringify(controller.getStatus())}`)

hops = []
const connectStarted = performance.now()
const connectStats = measureStringify(() => controller.connect())
await connectStats.result
const connectMs = performance.now() - connectStarted
const connectTrace = hops
hops = null

console.log(`  after  connect: ${nativeStringify(controller.getStatus())}`)
console.log(
  `  connect() wall time                     : ${connectMs.toFixed(1)} ms` +
    "   (thread spawn + tsx compiling the plugin module — once, and dominated by\n" +
    "                                            neither the protocol nor the clone)",
)
console.log(`  JSON.stringify calls during connect()   : ${connectStats.calls}`)
const connectWire = meter.total()
console.log(
  `  messages across the thread boundary     : ${connectWire.messages}\n` +
    `  bytes across it (structured-clone form) : ${connectWire.clone}\n` +
    `  the same messages as UTF-8 JSON         : ${connectWire.json}   (step 14's unit)`,
)

console.log("\n  the handshake, in the order it happened (t in ms from `new Worker(...)`):")
for (const h of [...connectTrace].sort((a, b) => a.t - b.t)) {
  console.log(
    `    ${pad((h.t - connectTrace[0].t).toFixed(1), 8)} ms  ${line(h.where, 11)}${h.what}`,
  )
}
console.log(
  "\n  Read the gap between the first two rows. `initialize` is posted the instant\n" +
    "  the Worker object exists — and then sits in the port's queue for as long as\n" +
    "  it takes Node to start a thread and tsx to compile `plugin-worker.ts` on it.\n" +
    "  A message to a plugin that has not finished loading is not an error; it is a\n" +
    "  queue. Step 12's `connect()` had nowhere to put such a message because there\n" +
    "  was no interval during which the plugin did not exist.",
)

console.log("\n  the host's rendering, built from cloned UINodes:")
for (const l of hostLines) console.log(`    ${l}`)

console.log("\n  the handler ids the host bound (strings, and only strings):")
for (const [key, id] of host.bindings) console.log(`    ${line(key, 20)} -> ${id}`)

console.log(
  `\n  the plugin's view of the host's global: ` +
    `globalThis.__hostSecret = ${probes.get("hostSecretVisibleToPlugin")}\n` +
    `  the host's own view                   : globalThis.__hostSecret = ` +
    `${nativeStringify((globalThis as { __hostSecret?: string }).__hostSecret)}\n` +
    "  Two heaps. Nothing the host holds is reachable from the plugin, which is\n" +
    "  why the only thing that can pass between them is data that copies.",
)

// --- 6.2 the function that cannot cross ------------------------------------

console.log("\n=== 2. A function cannot cross structured clone ===")

/** The "Refresh" button — the last button under the root, and the node section 3
 *  goes on to click. */
const handlerNode = (): UINode => {
  const buttons = (hostTree?.children ?? []).filter(
    (c): c is UINode => typeof c !== "string" && c.type === "button",
  )
  return buttons.at(-1) ?? { id: "node-?", type: "button", props: {}, children: [] }
}

const realButton = handlerNode()

// The SAME node, with the handler prop as React wrote it rather than as
// `serializeProps` rewrote it. This is what would cross if step 04 had not
// existed.
const withFunction: Record<string, unknown> = {
  id: realButton.id,
  type: realButton.type,
  props: { title: realButton.props.title, onClick: (): void => {} },
  children: [],
}

const rawResult = controller.postRawToWorker(withFunction)
console.log("  posting the node with its onClick still a function:")
console.log(`    worker.postMessage({ props: { onClick: () => {} } })`)
console.log(`    -> ${rawResult.ok ? "delivered" : rawResult.error}`)
console.log(
  "\n  That is not this file being careful; that is the structured-clone algorithm\n" +
    "  refusing, synchronously, inside postMessage, before anything was delivered.\n" +
    "  A function is a closure over a scope chain in this thread's heap. There is\n" +
    "  no representation of it the other thread could rebuild, so the specification\n" +
    "  does not try.",
)

console.log("\n  the same node as the plugin actually serialized it:")
console.log(`    ${show(realButton).split("\n").join("\n    ")}`)

const echoStats = measureStringify(() => controller.echo(realButton as unknown as JSONValue))
const echoed = await echoStats.result
console.log(
  `\n  and the same node sent to the worker and back over the real channel:\n` +
    `    round trip                           : ${(echoed.roundTripMs * 1000).toFixed(1)} µs   ` +
    `(cold — the channel's\n` +
    `                                           first echo; section 4 warms it)\n` +
    `    JSON.stringify calls on the way      : ${echoStats.calls}\n` +
    `    handler prop survived as             : ` +
    `${nativeStringify(Object.entries(realButton.props).find(([k]) => isHandlerIdProp(k))?.[1])}`,
)
console.log(
  "\n  `HandlerId = string` (packages/protocol/src/events.ts) is the entire fix,\n" +
    "  and step 04 shipped it eight steps before anything could test it. The\n" +
    "  closure never moves: it stays in the worker's `HandlerRegistry`, and the\n" +
    "  host holds a name for it. Everything the host can do to a callback it does\n" +
    "  by sending that name back.",
)

// --- 6.3 one click, hop by hop, across a thread ----------------------------

console.log("\n=== 3. One click, hop by hop, across a thread ===")

const refreshId = [...host.bindings.values()].at(-1) ?? ""

/**
 * Warm-up, printed nowhere — step 12 did the same before its trace, and for the
 * same reason, but here it has to happen on THIS controller: the plugin runs in
 * its own V8 isolate, so warming a different worker warms nothing. Five clicks
 * so that the trace below times a steady-state round trip instead of the
 * reconciler's first commit and kkrpc's first dispatch on a cold thread.
 */
for (let i = 0; i < 5; i++) await controller.executeHandler(refreshId, [])

hops = []
hop("host", `button "Refresh" clicked -> executeHandler(${nativeStringify(refreshId)})`)

const beforeClickWire = meter.total()
const beforeClickLogs = meter.records.filter((r) => r.method.startsWith("log")).length
const rendersBeforeClick = hostRenders
const clickStats = measureStringify(() => {
  hop("controller", "rpc.getAPI().executeHandler(...) — returns a pending promise")
  return dispatchHostEvent(controller, refreshId, [])
})
const rendersRightAfterCall = hostRenders
await clickStats.result
hop("host", "await resolves")

const clickTrace = [...hops].sort((a, b) => a.t - b.t)
hops = null

const t0 = clickTrace[0].t
console.log("  hop trace (t in µs from the click; plugin rows are the worker's own clock):")
for (const h of clickTrace) {
  console.log(`    ${pad(((h.t - t0) * 1000).toFixed(1), 9)} µs  ${line(h.where, 11)}${h.what}`)
}

const clickWire = {
  messages: meter.total().messages - beforeClickWire.messages,
  clone: meter.total().clone - beforeClickWire.clone,
  json: meter.total().json - beforeClickWire.json,
}
const clickLogs = meter.records.filter((r) => r.method.startsWith("log")).length - beforeClickLogs
console.log(
  `\n  JSON.stringify calls for the whole round trip : ${clickStats.calls}\n` +
    `  messages across the boundary                  : ${clickWire.messages}` +
    `   (${clickLogs} of them this file's own trace)\n` +
    `  bytes across it (structured-clone form)       : ${clickWire.clone}\n` +
    `  host re-renders when executeHandler() RETURNED: ${rendersRightAfterCall - rendersBeforeClick}\n` +
    `  host re-renders when the await RESOLVED       : ${hostRenders - rendersBeforeClick}`,
)
console.log(
  "\n  Those last two lines are step 12's most-quoted result, inverted. There the\n" +
    "  host had already re-rendered with the new text BEFORE the first await,\n" +
    "  because the whole chain ran synchronously on one stack, and the promise was\n" +
    "  a uniformity tax. Here nothing whatever has happened when the call returns —\n" +
    "  and yet by the time the promise resolves, the tree is current. That is not\n" +
    "  timing, it is ORDERING: the worker posts its `applyMutations` message before\n" +
    "  it returns from `executeHandler`, one channel delivers in order, so the host\n" +
    "  cannot observe the reply before the mutations that caused it. A host that\n" +
    "  reads `getTree()` after awaiting a handler gets a tree that includes the\n" +
    "  handler's effects, on both transports, for two completely different reasons.",
)

console.log("\n  the plugin closure's own stack, captured inside the handler:")
for (const frame of String(probes.get("pluginStack") ?? "").split("\n").slice(0, 7)) {
  console.log(`    ${frame.trim()}`)
}
console.log(
  `\n  stack contains the host's dispatchHostEvent frame: ` +
    `${String(probes.get("pluginStack") ?? "").includes("dispatchHostEvent")}\n` +
    "  Step 12 printed `true` here and called that boolean the whole of its step.\n" +
    "  The frames above it are kkrpc's message dispatch and the worker's own\n" +
    "  event loop; the host's stack is in another thread and this one has never\n" +
    "  seen it. Nothing in the plugin can walk up into the host — not to read a\n" +
    "  variable, not to touch a DOM node, not to catch its exceptions.",
)

// --- 6.4 the boundary table, extended --------------------------------------

console.log("\n=== 4. Step 12's boundary table, with the Worker row measured ===")

const mountTree = hostTree
const capturedBatch: Mutation[] = [{ type: "setRoot", node: mountTree }]
const mountNodes = mountTree ? countNodes(mountTree) : 0
const mountJson = utf8(nativeStringify(capturedBatch))

// Warm up the channel so the crossing figure is steady-state and not "V8 has
// never run this path" — step 12 warmed its reconciler for the same reason.
for (let i = 0; i < 20; i++) await controller.echo(capturedBatch as unknown as JSONValue)

const CROSSINGS = 60
let oneWayTotal = 0
let roundTripTotal = 0
for (let i = 0; i < CROSSINGS; i++) {
  const r = await controller.echo(capturedBatch as unknown as JSONValue)
  oneWayTotal += r.oneWayMs
  roundTripTotal += r.roundTripMs
}
const workerOneWayUs = (oneWayTotal / CROSSINGS) * 1000
const workerRoundTripUs = (roundTripTotal / CROSSINGS) * 1000
const echoRecord = meter.last("echo")

// The two counterfactual rows, computed on the identical payload so all four
// rows are comparable. `none` is step 12's controller; `json` is step 14's.
const timeCross = (fn: () => void): number => {
  for (let i = 0; i < 20; i++) fn()
  const started = performance.now()
  for (let i = 0; i < 200; i++) fn()
  return ((performance.now() - started) * 1000) / 200
}

// Step 12's `Boundary.cross()` with `kind: "none"` was `return payload`, and its
// row measured exactly that. `sink` exists so V8 cannot delete the call.
let sink: unknown = null
const identityCross = <T,>(payload: T): T => payload
const noneUs = timeCross(() => {
  sink = identityCross(capturedBatch)
})
const cloneOnly = measureStringify(() => timeCross(() => void structuredClone(capturedBatch)))
const jsonRow = measureStringify(() =>
  timeCross(() => void JSON.parse(JSON.stringify(capturedBatch))),
)

console.log(
  `    ${line("boundary", 36)}${pad("bytes", 8)}${pad("v8 B", 8)}${pad("stringify", 11)}${pad("µs/cross", 11)}`,
)
console.log(`    ${"-".repeat(74)}`)
console.log(
  `    ${line("main thread — no boundary", 36)}${pad(0, 8)}${pad(0, 8)}${pad(0, 11)}${pad(noneUs.toFixed(2), 11)}`,
)
console.log(
  `    ${line("Web Worker — structuredClone (copy)", 36)}${pad(mountJson, 8)}` +
    `${pad(cloneBytes(capturedBatch), 8)}${pad(cloneOnly.calls, 11)}${pad(cloneOnly.result.toFixed(2), 11)}`,
)
console.log(
  `    ${line("Web Worker — real thread hop (kkrpc)", 36)}${pad(echoRecord?.jsonBytes ?? 0, 8)}` +
    `${pad(echoRecord?.cloneBytes ?? 0, 8)}${pad(0, 11)}${pad(workerOneWayUs.toFixed(2), 11)}`,
)
console.log(
  `    ${line("WebSocket — JSON text frame", 36)}${pad(mountJson, 8)}${pad("—", 8)}` +
    `${pad(jsonRow.calls > 0 ? 1 : 0, 11)}${pad(jsonRow.result.toFixed(2), 11)}`,
)

console.log(
  `\n    payload: one setRoot carrying ${mountNodes} nodes / ${mountJson} B of JSON.\n` +
    `    Rows 1 and 4 are step 12's counterfactuals recomputed on THIS payload, so\n` +
    `    all four rows are comparable to each other. (Step 12's own payload was one\n` +
    `    button smaller: 22 nodes / 1758 B, and it estimated the Worker row at\n` +
    `    1786 B / 23.72 µs by running structuredClone in-process — which is row 2\n` +
    `    here. Row 3 is what it actually costs when the clone has to reach another\n` +
    `    thread.)\n` +
    `\n    "bytes" is UTF-8 JSON, the unit steps 12 and 14 use. "v8 B" is the real\n` +
    `    structured-clone encoding — Node's postMessage serializer, measured on the\n` +
    `    exact message that crossed, RPC framing included. Row 3's µs is the mean\n` +
    `    of ${CROSSINGS} real crossings (send timestamp on this thread, arrival\n` +
    `    timestamp taken by the worker; the two clocks share a timeOrigin because\n` +
    `    the threads share a process). Its round trip was ` +
    `${workerRoundTripUs.toFixed(2)} µs.\n` +
    `\n    Row 1 is a function that returns its argument, timed so that the zero is a\n` +
    `    measurement and not a rhetorical flourish. Rows 2 and 3 are the same clone\n` +
    `    twice: building it in this thread, and building it AND getting the other\n` +
    `    thread to pick it up — ${(workerOneWayUs / cloneOnly.result).toFixed(1)}x the copy alone, so most of a crossing is\n` +
    `    not the copying.\n` +
    `\n    The stringify column is the one to stare at: a Worker moves ${echoRecord?.cloneBytes ?? 0} bytes and\n` +
    `    calls JSON.stringify zero times. Structured clone is not serialization to\n` +
    `    text, which is why Date, Map and NaN survive it and why a function throws\n` +
    `    instead of vanishing. Step 14's row is where that stops being true in both\n` +
    `    directions at once.`,
)
void sink

console.log("\n  every RPC message this run has put on the wire, by method:")
const byMethod = new Map<string, { n: number; clone: number; json: number }>()
for (const record of meter.records) {
  const key = `${record.dir}  ${record.method}`
  const entry = byMethod.get(key) ?? { n: 0, clone: 0, json: 0 }
  entry.n += 1
  entry.clone += record.cloneBytes
  entry.json += record.jsonBytes
  byMethod.set(key, entry)
}
console.log(`    ${line("direction / method", 40)}${pad("count", 7)}${pad("v8 B", 10)}${pad("JSON B", 10)}`)
console.log(`    ${"-".repeat(67)}`)
for (const [key, entry] of [...byMethod].sort((a, b) => b[1].clone - a[1].clone)) {
  console.log(`    ${line(key, 40)}${pad(entry.n, 7)}${pad(entry.clone, 10)}${pad(entry.json, 10)}`)
}
console.log(
  `\n    \`echo\` dominates because section 4 crossed the boundary ${CROSSINGS} times on\n` +
    "    purpose (plus a 20-crossing warm-up). The rows that matter for a real host\n" +
    "    are `initialize` (the handshake), `applyMutations` (step 05's batches, now\n" +
    "    as messages) and `executeHandler` (one per click).\n" +
    "    `log` is this file's own trace: the\n" +
    "    instrument shows up in its own measurement, because on a boundary that is\n" +
    "    the only place it could show up.",
)

// --- 6.5 what the boundary bought ------------------------------------------

console.log("\n=== 5. What it bought: the plugin blocks a thread the host is not on ===")

/** Counts main-thread event-loop turns while something else is happening. */
async function ticksDuring(work: () => Promise<void>): Promise<{ ticks: number; ms: number }> {
  let ticks = 0
  const timer = setInterval(() => {
    ticks += 1
  }, 1)
  const started = performance.now()
  await work()
  const ms = performance.now() - started
  clearInterval(timer)
  return { ticks, ms }
}

const recountId = [...host.bindings.values()].at(-2) ?? ""
const inWorker = await ticksDuring(async () => {
  await controller.executeHandler(recountId, [])
})

// The identical loop, on this thread — which is what step 12's controller did
// with the identical plugin code.
const onMain = await ticksDuring(async () => {
  const until = performance.now() + 150
  let spins = 0
  while (performance.now() < until) spins++
  void spins
})

console.log(
  `  a handler that busy-loops for 150 ms:\n` +
    `    ${line("", 34)}${pad("elapsed ms", 12)}${pad("host ticks", 12)}\n` +
    `    ${"-".repeat(58)}\n` +
    `    ${line("plugin in the worker (step 13)", 34)}${pad(inWorker.ms.toFixed(0), 12)}${pad(inWorker.ticks, 12)}\n` +
    `    ${line("same loop on the main thread (12)", 34)}${pad(onMain.ms.toFixed(0), 12)}${pad(onMain.ticks, 12)}`,
)
console.log(
  `\n  The worker spun ${probes.get("blockingSpins")} times without the host losing a single\n` +
    "  timer tick. Step 12's trade-off list said it plainly: \"a plugin that blocks\n" +
    "  blocks the host\". Two rows above are what buying your way out of that\n" +
    "  sentence costs — section 4's microseconds and section 2's exception — and\n" +
    "  what it buys.",
)

// --- 6.6 the handshake, failed on purpose ----------------------------------

console.log("\n=== 6. PROTOCOL_VERSION: the first message, and what it is for ===")

const badMeter = new WireMeter()
const badController = createWorkerController({
  pluginUrl: PLUGIN_URL,
  meter: badMeter,
  protocolVersionOverride: PROTOCOL_VERSION - 1,
})

let handshakeError = "(none — the handshake did not fail)"
try {
  await badController.connect()
} catch (error) {
  handshakeError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
await badController.destroy()

console.log(`  host claims protocolVersion=${PROTOCOL_VERSION - 1}, plugin is built against ${PROTOCOL_VERSION}:`)
console.log(`    connect() -> ${handshakeError}`)
console.log(
  "\n  That error was thrown by `assertProtocolVersion` INSIDE the worker\n" +
    "  (runtime.ts:55-61), travelled back as an RPC error record, and became a\n" +
    "  rejected promise on the host's `await api.initialize(...)`. Step 12's\n" +
    "  controller has no such exchange and needs none: host and plugin were one\n" +
    "  bundle, compiled together, so there was nothing to disagree with. The\n" +
    "  moment the plugin became a separately-loaded module, versions became a\n" +
    "  thing two parties can differ about — and in production the difference is\n" +
    "  worse than here, because `controllers/worker.ts` fetches the plugin over\n" +
    "  HTTP from wherever it was deployed.",
)

// --- 6.7 teardown, and the seam that did not change ------------------------

console.log("\n=== 7. syncTree, updateProps, and a clean exit ===")

await controller.updateProps({ title: "Open tickets (updated)" })
console.log(`  updateProps -> heading text now: ${nativeStringify(hostLines[2]?.trim())}`)

const rendersBeforeSync = hostRenders
await controller.syncTree()
console.log(
  `  syncTree()  -> host renders ${rendersBeforeSync} -> ${hostRenders}` +
    "   (the plugin re-serialized its whole tree and posted it back)",
)

unsubscribe()
await controller.destroy()
console.log(`  after destroy(): ${nativeStringify(controller.getStatus())}`)

// Restore the global we patched in section 1.
JSON.stringify = nativeStringify

const live = process
  .getActiveResourcesInfo()
  .filter((r) => /Worker|MessagePort/i.test(r))
console.log(
  `  live worker/port handles after teardown: ${live.length === 0 ? "none" : live.join(", ")}\n` +
    "  Both workers were terminated (rpc.destroy() then worker.terminate(), the\n" +
    "  order controllers/worker.ts uses), so the process ends on its own. A step\n" +
    "  that leaves a worker running does not exit, and there is no output to read.",
)

const final = meter.total()
console.log(
  "\n  THE BASELINE, EXTENDED\n" +
    `    messages across the thread boundary : ${final.messages}\n` +
    `    bytes, structured-clone form        : ${final.clone}\n` +
    `    bytes, the same as UTF-8 JSON       : ${final.json}\n` +
    `    JSON.stringify calls, connect       : ${connectStats.calls}\n` +
    `    JSON.stringify calls, full click    : ${clickStats.calls}\n` +
    `    one crossing of the mount payload   : ${workerOneWayUs.toFixed(2)} µs ` +
    `(step 12: 0)\n` +
    `    host's tree === plugin's tree       : impossible — the host holds clones`,
)
console.log(
  "\n  Step 12's numbers were zero because `boundary.cross()` was the identity\n" +
    "  function. These are not, because it is a thread. Nothing between the two\n" +
    "  files changed shape to make that true: same protocol, same MutableTree,\n" +
    "  same outline host, same ten-member interface, same handler ids. What the\n" +
    "  contract cost to design in steps 01-05 is exactly what it saves here, and\n" +
    "  step 14 pays the same bill again in a currency where the clone is not even\n" +
    "  available.",
)
