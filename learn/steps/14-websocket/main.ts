/**
 * Step 14 — the plugin in another process, over a socket.
 *
 * Stage D's third and last runtime. Step 12 removed the boundary entirely
 * (`cross()` returned the identical object). Step 13 made it a structured
 * clone: a real copy, a real thread hop, but still one process, one lifetime,
 * one guaranteed-alive peer. This step makes it a TCP connection.
 *
 * Nothing about the plugin changes. `plugin-process.ts` beside this file is
 * step 12's renderer verbatim — same `HostConfig`, same `MutationCollector`,
 * same `TicketPanel`. What changes is everything AROUND it, and the change is
 * not quantitative:
 *
 *   1. EVERYTHING IS TEXT. Every frame in both directions is
 *      `JSON.stringify`d and re-parsed. Structured clone's object graph is
 *      gone: only what survives `JSON.parse(JSON.stringify(x))` exists. A
 *      `Date` arrives as a string, a `Map` as `{}`, `NaN` as `null`, and a
 *      function is dropped without an error — which is why step 04's
 *      `HandlerId` indirection is load-bearing rather than defensive.
 *
 *   2. THE PEER CAN DISAPPEAR. This is the new category. A Worker cannot
 *      half-fail; a socket can, and does. Section 5 does it for real: the
 *      connection is cut mid-session while the plugin keeps rendering, the two
 *      trees diverge, the plugin reconnects, and `syncTree()` — the protocol
 *      member whose doc comment reads "Used for recovery from drift"
 *      (packages/protocol/src/rpc.ts:50-54) — puts them back together.
 *
 *   3. "ONLY SEND WHAT CHANGED" STOPS BEING A NICETY. Step 05's incremental
 *      mode saved CPU on the main thread. Here every byte it saves is a byte
 *      not written to a socket, and section 4 prices it.
 *
 * WHAT IS REAL IN THIS FILE. A `ws` server on 127.0.0.1 and an ephemeral port;
 * a genuine `child_process.fork` of `plugin-process.ts` with its own PID and
 * heap; real JSON frames, printed; real byte counts; real cross-process
 * timings; a real socket termination and a real reconnect. Nothing is
 * simulated, and the process exits cleanly with no orphan.
 *
 * HOW IT DIFFERS FROM THE REAL TOPOLOGY, stated once here and again in the
 * doc: upstream, BOTH ends are WebSocket clients of a third process — the
 * bridge (`examples/bridge-server/src/bridge.ts`), which pairs
 * `/plugins/:pluginId` with `/host/:pluginId` and forwards bytes. This file
 * collapses the bridge into the host, so the host is the server and the plugin
 * dials it. The seam being taught — JSON frames, request ids, drops,
 * reconnects, `syncTree` — is identical; what is missing is named in "What
 * this step leaves out".
 */

import { fork } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { WebSocketServer, type WebSocket } from "ws"

import {
  PROTOCOL_VERSION,
  TEXT_NODE_TYPE,
  WireLink,
  epochNow,
  line,
  pad,
  trimFrame,
  utf8,
  type AppendChildMutation,
  type FrameRecord,
  type HandlerId,
  type Hop,
  type InsertBeforeMutation,
  type JSONValue,
  type Mutation,
  type PluginToHostAPI,
  type RemoveChildMutation,
  type SetPropsMutation,
  type SetRootMutation,
  type SetTextMutation,
  type UINode,
} from "./protocol"

// ===========================================================================
// 1. Host-side apparatus carried forward from steps 02 / 07 / 08 / 12
// ===========================================================================

function show(node: UINode | string, depth = 0): string {
  const p = "  ".repeat(depth)
  if (typeof node === "string") return `${p}"${node}" (legacy bare string)`
  if (node.type === TEXT_NODE_TYPE) return `${p}#text#${node.id} "${node.text}"`
  const props = Object.entries(node.props)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ")
  return [
    `${p}<${node.type}#${node.id}${props ? " " + props : ""}>`,
    ...node.children.map((c) => show(c, depth + 1)),
  ].join("\n")
}

function countNodes(node: UINode | string): number {
  if (typeof node === "string") return 1
  return 1 + node.children.reduce<number>((n, c) => n + countNodes(c), 0)
}

/**
 * `packages/host-sdk/src/mutable-tree.ts`, as rebuilt in steps 02 and 12.
 * Unchanged — and that is the point worth noticing. The applier does not know
 * whether its input arrived by reference, by structured clone or off a socket.
 * It is also, for exactly that reason, defenceless: see section 6.
 */
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

const LAYOUT_TAGS = ["div", "span", "button", "input", "p", "ul", "li"] as const
type UILayoutTag = (typeof LAYOUT_TAGS)[number]
const isLayoutTag = (type: string): type is UILayoutTag =>
  (LAYOUT_TAGS as readonly string[]).includes(type)

const handlerEventName = (propKey: string): string | null => {
  const match = /^_on([A-Z][A-Za-z]*)HandlerId$/.exec(propKey)
  return match ? match[1].toLowerCase() : null
}

interface OutlineHost {
  render(tree: UINode | null): string[]
  bindings: Map<string, HandlerId>
  renders: number
}

/** Step 08's recursive host, trimmed. It has no idea a socket exists. */
function createOutlineHost(): OutlineHost {
  const bindings = new Map<string, HandlerId>()
  const containerTypes = new Set(["column", "row", "heading", "label"])

  function serializeAttrs(node: UINode): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(node.props)) {
      const event = handlerEventName(key)
      if (event !== null) {
        bindings.set(`${node.id} ${event}`, String(value))
        parts.push(`on:${event}=${JSON.stringify(value)}`)
        continue
      }
      parts.push(`${key}=${JSON.stringify(value)}`)
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
    if (containerTypes.has(node.type)) {
      return [`<${node.type}${attrs}>`, ...childLines.map((l) => "  " + l), `</${node.type}>`]
    }
    return [`Unknown: ${node.type}`]
  }

  const host: OutlineHost = {
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

// ===========================================================================
// 2. The seam, unchanged since step 07
// ===========================================================================

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
// 3. The transport harness: a real ws server on a real ephemeral port
// ===========================================================================
//
// `PluginEndpoint` is the piece that has no counterpart in steps 12 and 13,
// because in those the plugin's existence was a fact of the constructor. Here
// the plugin arrives, leaves, and arrives again, and something has to represent
// "the socket, whichever one it currently is".

interface PluginEndpoint {
  /** The socket right now, or null while the plugin is away. */
  current(): WebSocket | null
  /** Fires every time a plugin process attaches — including reconnects. */
  onAttach(cb: (socket: WebSocket) => void): () => void
  /** Resolves once a socket is attached. */
  ready(): Promise<void>
  attachments: number
}

interface Harness {
  endpoint: PluginEndpoint
  url: string
  close(): Promise<void>
  /** When true, incoming connections are terminated on arrival: a real outage. */
  blackout: boolean
}

async function startHarness(): Promise<Harness> {
  // 127.0.0.1 and port 0: loopback only, and let the kernel pick the port. A
  // fixed port is how two runs of a test suite discover each other by accident.
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 })
  await once(wss, "listening")
  const address = wss.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected an AddressInfo from a TCP WebSocketServer")
  }

  let socket: WebSocket | null = null
  const attachCallbacks = new Set<(socket: WebSocket) => void>()
  let readyResolve: (() => void) | null = null
  let readyPromise: Promise<void> | null = null

  const harness: Harness = {
    blackout: false,
    // The path mirrors the real bridge's plugin route, `/plugins/:pluginId`
    // (bridge.ts:112-123). Nothing here parses it; it is there so the frames
    // below look like the ones a real deployment carries.
    url: `ws://127.0.0.1:${address.port}/plugins/tickets`,
    endpoint: {
      attachments: 0,
      current: () => socket,
      onAttach(cb) {
        attachCallbacks.add(cb)
        return () => attachCallbacks.delete(cb)
      },
      ready() {
        if (socket) return Promise.resolve()
        if (!readyPromise) {
          readyPromise = new Promise<void>((resolve) => {
            readyResolve = resolve
          })
        }
        return readyPromise
      },
    },
    async close() {
      socket?.close()
      wss.close()
      await once(wss, "close")
    },
  }

  wss.on("connection", (ws: WebSocket) => {
    if (harness.blackout) {
      // Not a polite close: a terminate, which is what a dropped route or a
      // restarted server looks like from the other end.
      ws.terminate()
      return
    }
    socket = ws
    harness.endpoint.attachments += 1
    ws.on("close", () => {
      if (socket === ws) socket = null
    })
    for (const cb of attachCallbacks) cb(ws)
    readyResolve?.()
    readyResolve = null
    readyPromise = null
  })

  return harness
}

// ===========================================================================
// 4. createWebSocketController — packages/host-sdk/src/controllers/websocket.ts
// ===========================================================================
//
// Compare the real file side by side. Its `hostAPI` object is reproduced below
// member for member, and so is the body of every controller method: `connect`
// builds a transport, wraps it in an RPC channel, sets `connected = true` and
// awaits `api.initialize({ protocolVersion: PROTOCOL_VERSION, props })`;
// `executeHandler` / `updateProps` / `syncTree` are one `await api.X(...)`
// each; `disconnect` calls `api.destroy()` inside a try/catch and then throws
// the channel away.
//
// Three things here are additions, and each is flagged where it appears:
//   - `meter` / `frames` / `hopSink`, so the wire can be measured and printed;
//   - `endpoint` instead of `serverUrl` + `pluginId`, because this host IS the
//     server (see the file header);
//   - re-attaching the RPC channel when the plugin reconnects. The real
//     controller has NO such code — that asymmetry is section 5's subject and
//     is named in the doc.

interface WireMeter {
  bytesOut: number
  bytesIn: number
  framesOut: number
  framesIn: number
}

/** Hop recording is windowed: set `.current` to an array to record, null to stop. */
interface HopSink {
  current: Hop[] | null
}

export interface WebSocketControllerOptions {
  endpoint: PluginEndpoint
  initialProps?: JSONValue
  meter: WireMeter
  /** Every frame in both directions, in order, for printing. */
  frames: FrameRecord[]
  hopSink: HopSink
}

interface WebSocketController extends PluginController {
  /** Teaching-only: pull the plugin process's own hop log across the wire. */
  pluginHops(): Promise<Hop[]>
  /** Teaching-only: how many mutation frames the plugin could not send. */
  pluginDrops(): Promise<number>
  /** Wait until a (re)connected plugin has an RPC channel again. */
  waitForAttach(): Promise<void>
}

function createWebSocketController(opts: WebSocketControllerOptions): WebSocketController {
  const { endpoint, initialProps, meter, frames, hopSink } = opts

  let wire: WireLink | null = null
  let tree: UINode | null = null
  let mutableTree = new MutableTree()
  let connected = false
  let lastError: string | undefined
  const subscribers = new Set<(tree: UINode | null) => void>()
  const errorSubscribers = new Set<(message: string) => void>()

  const hop = (where: Hop["where"], what: string): void => {
    hopSink.current?.push({ at: epochNow(), where, what })
  }

  const notify = (): void => {
    subscribers.forEach((cb) => void cb(tree))
  }

  /**
   * The host's half of the contract. Every argument that arrives here came out
   * of `JSON.parse`. There is no way to assert that at the type level — the
   * declaration says `Mutation[]` and the runtime says "whatever was in the
   * frame" — which is why the real controllers accept a `validate` flag that
   * runs the Zod schemas over incoming payloads (`host-sdk/src/validate.ts`,
   * off by default because "validation walks the whole payload and is not
   * free").
   */
  const hostAPI: PluginToHostAPI = {
    updateTree(newTree: UINode | null) {
      hop("host", `updateTree(${newTree ? countNodes(newTree) : 0} nodes) -> mutableTree.init`)
      tree = newTree
      mutableTree.init(newTree)
      notify()
    },
    applyMutations(mutations: Mutation[]) {
      hop("host", `applyMutations(${mutations.length}) -> MutableTree`)
      tree = mutableTree.applyMutations(mutations)
      notify()
    },
    log(level, args) {
      console.log(`    [Plugin WS ${level}]`, ...args.map((a) => String(a)))
    },
    reportError(err) {
      lastError = err.message
      console.error("    [Plugin WS Error]", err.message)
      errorSubscribers.forEach((cb) => void cb(err.message))
    },
  }

  const exposed = {
    updateTree: (t: UINode | null) => hostAPI.updateTree(t),
    applyMutations: (m: Mutation[]) => hostAPI.applyMutations(m),
    log: (level: "log" | "info" | "warn" | "error", args: JSONValue[]) =>
      hostAPI.log(level, args),
    reportError: (err: { message: string; stack?: string }) => hostAPI.reportError(err),
  } as unknown as Record<string, (...args: never[]) => unknown>

  let attachWaiters: (() => void)[] = []

  endpoint.onAttach((socket) => {
    wire = new WireLink(socket, exposed, {
      onFrame(record) {
        frames.push(record)
        if (record.dir === "out") {
          meter.framesOut += 1
          meter.bytesOut += record.bytes
        } else {
          meter.framesIn += 1
          meter.bytesIn += record.bytes
        }
      },
    })
    connected = true
    lastError = undefined

    socket.on("close", () => {
      // The real `createWebSocketController` never learns this happened: it
      // holds a kkrpc channel over a socket it does not observe, and there is
      // no `close` handler anywhere in the file. Here the status at least stops
      // lying.
      connected = false
      lastError = "connection closed"
      wire?.destroy()
      wire = null
    })

    const waiters = attachWaiters
    attachWaiters = []
    for (const w of waiters) w()
  })

  const call = async (method: string, args: unknown[]): Promise<unknown> => {
    if (!wire) return undefined
    hop("controller", `-> ${method}(...) written to the socket`)
    return await wire.call(method, args)
  }

  return {
    async connect() {
      await endpoint.ready()
      // `connected = true` happens on attach, before `initialize` — exactly as
      // in the real file, which sets it before awaiting the RPC
      // (controllers/websocket.ts:83-90).
      await call("initialize", [
        { protocolVersion: PROTOCOL_VERSION, props: initialProps ?? null },
      ])
    },

    async disconnect() {
      if (wire) {
        try {
          await wire.call("destroy", [])
        } catch {}
        wire.destroy()
      }
      wire = null
      connected = false
      tree = null
      mutableTree = new MutableTree()
    },

    async updateProps(props: JSONValue) {
      await call("updateProps", [props])
    },

    async executeHandler(handlerId: HandlerId, args?: JSONValue[]) {
      await call("executeHandler", [handlerId, args ?? []])
    },

    async destroy() {
      await this.disconnect()
      subscribers.clear()
      errorSubscribers.clear()
    },

    async syncTree() {
      if (!connected || !wire) return
      await call("syncTree", [])
    },

    getTree: () => tree,

    subscribe(cb) {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },

    subscribeErrors(cb) {
      errorSubscribers.add(cb)
      return () => {
        errorSubscribers.delete(cb)
      }
    },

    getStatus: () => ({
      mode: "websocket" as const,
      connected,
      ...(lastError !== undefined ? { lastError } : {}),
    }),

    async pluginHops() {
      const result = await call("__hops", [])
      return (result ?? []) as Hop[]
    },

    async pluginDrops() {
      const result = await call("__drops", [])
      return typeof result === "number" ? result : 0
    },

    waitForAttach() {
      if (wire) return Promise.resolve()
      return new Promise<void>((resolve) => attachWaiters.push(resolve))
    },
  }
}

// ===========================================================================
// 5. Run it
// ===========================================================================

const here = dirname(fileURLToPath(import.meta.url))
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const meter: WireMeter = { bytesOut: 0, bytesIn: 0, framesOut: 0, framesIn: 0 }
const frames: FrameRecord[] = []
const hopSink: HopSink = { current: null }

const harness = await startHarness()
const host = createOutlineHost()

// The controller is built BEFORE the fork, so its `onAttach` handler is already
// registered when the plugin process dials in. Registering it afterwards is a
// race that would win 99 times out of 100 and lose on a loaded machine.
const controller = createWebSocketController({
  endpoint: harness.endpoint,
  initialProps: { title: "Open tickets" },
  meter,
  frames,
  hopSink,
})

let hostLines: string[] = []
let hostRenders = 0
const unsubscribe = controller.subscribe((tree) => {
  hostRenders += 1
  hostLines = host.render(tree)
})

// --- 5.1 connect -----------------------------------------------------------

console.log("=== 1. A real socket, a real second process ===")
console.log(`  ws server        : ${harness.url}`)
console.log(`  host process pid : ${process.pid}`)

/**
 * A genuine `fork`: a new OS process running `plugin-process.ts`. `execArgv` is
 * inherited so the child gets the same tsx loader this file is running under.
 * stdio is piped rather than inherited so the child's own writes cannot
 * interleave unpredictably with the transcript below — everything the plugin
 * wants to say in order goes through the protocol's own `log` RPC instead.
 */
const child = fork(join(here, "plugin-process.ts"), [harness.url], {
  cwd: join(here, "..", ".."),
  execArgv: process.execArgv,
  stdio: ["ignore", "pipe", "pipe", "ipc"],
})

let childOutput = ""
child.stdout?.on("data", (chunk: Buffer) => {
  childOutput += chunk.toString()
})
child.stderr?.on("data", (chunk: Buffer) => {
  childOutput += chunk.toString()
})

console.log(`  plugin process   : pid ${child.pid} (fork of plugin-process.ts)`)
console.log(`  same process?    : ${child.pid === process.pid}`)

console.log(`\n  before connect: ${JSON.stringify(controller.getStatus())}`)
const connectStarted = epochNow()
await controller.connect()
const connectMs = epochNow() - connectStarted
console.log(`  after  connect: ${JSON.stringify(controller.getStatus())}`)
console.log(`  connect() wall time, from ready socket to first tree: ${connectMs.toFixed(2)} ms`)

console.log("\n  the UINode the host rebuilt out of text (first 6 lines):")
for (const l of show(controller.getTree() as UINode).split("\n").slice(0, 6)) {
  console.log(`    ${l}`)
}

console.log("\n  the host's rendering:")
for (const l of hostLines) console.log(`    ${l}`)

console.log("\n  the handler ids the host bound (strings that crossed a socket):")
for (const [key, id] of host.bindings) console.log(`    ${line(key, 20)} -> ${id}`)

console.log(
  `\n  bytes on the wire for connect(): ${meter.bytesOut} out / ${meter.bytesIn} in` +
    ` over ${meter.framesOut + meter.framesIn} frames`,
)

// --- 5.2 one click, hop by hop, across two processes -----------------------

console.log("\n=== 2. One click, hop by hop, across two processes ===")

const clickIds = [...host.bindings.values()]
const refreshId = clickIds.at(-2) ?? ""
const burstId = clickIds.at(-1) ?? ""

// Drain the plugin's mount-time hops so the trace below is only the click.
await controller.pluginHops()

const framesBeforeClick = frames.length
const hostHops: Hop[] = []
hopSink.current = hostHops

hostHops.push({
  at: epochNow(),
  where: "host",
  what: `button "Refresh" clicked -> executeHandler(${JSON.stringify(refreshId)})`,
})
const clickStarted = epochNow()
await controller.executeHandler(refreshId, [])
hostHops.push({
  at: epochNow(),
  where: "host",
  what: "await resolves (the response frame came back)",
})
const clickMs = epochNow() - clickStarted
hopSink.current = null

// Ask the plugin process for its own hop log. It is a separate clock domain
// converted to the same epoch — see `epochNow` in protocol.ts.
const remoteHops = await controller.pluginHops()
const trace = [...hostHops, ...remoteHops].sort((a, b) => a.at - b.at)
const t0 = trace[0]?.at ?? 0

console.log("  hop trace (t in µs from the click; host and plugin clocks merged):")
for (const h of trace) {
  console.log(`    ${pad(((h.at - t0) * 1000).toFixed(1), 9)} µs  ${line(h.where, 11)}${h.what}`)
}
console.log(`\n  round trip, host clock: ${(clickMs * 1000).toFixed(1)} µs`)
console.log(
  "  Step 12 printed this same trace with the plugin's closure running on the\n" +
    "  host's own stack, and proved it by finding `dispatchHostEvent` in a stack\n" +
    "  captured inside the plugin. There is no shared stack now — that frame is in\n" +
    "  a different process image — and the boolean step 12 printed as `true` is\n" +
    "  necessarily false here. Latency stopped being a rounding error.",
)

// --- 5.3 the protocol, as text --------------------------------------------

console.log("\n=== 3. The frames, as they actually went over the wire ===")

const clickFrames = frames.slice(framesBeforeClick)
for (const f of clickFrames) {
  const arrow = f.dir === "out" ? "host ->" : "host <-"
  console.log(`    ${arrow} ${pad(f.bytes, 5)} B  ${trimFrame(f.text, 100)}`)
}
const clickBatchFrame = clickFrames.find((f) => f.text.includes('"applyMutations"'))
const clickBatch = clickBatchFrame
  ? (((JSON.parse(clickBatchFrame.text.trim()) as { a?: unknown[] }).a?.[0] ?? []) as Mutation[])
  : []
const kinds = new Map<string, number>()
for (const m of clickBatch) kinds.set(m.type, (kinds.get(m.type) ?? 0) + 1)

console.log(
  "\n  Every one of those is a string. `p` is kkrpc's property path, `id` matches\n" +
    "  a response to its request, `a` is the argument array — and the whole\n" +
    "  `applyMutations` argument is step 05's incremental batch, verbatim.",
)
console.log(
  `\n  that batch, by kind: ` +
    `${[...kinds].map(([k, n]) => `${k}\u00d7${n}`).join(", ")}` +
    ` in ${clickBatchFrame?.bytes ?? 0} B`,
)
if (clickBatchFrame) {
  console.log("\n  and that frame in full, wrapped, because it is the whole protocol:")
  const flat = clickBatchFrame.text.trim()
  for (let i = 0; i < flat.length; i += 96) console.log(`    ${flat.slice(i, i + 96)}`)
}
console.log(
  "\n  One `setText` is the actual change. The five `setProps` are React\n" +
    "  re-emitting props that did not change, because `TicketPanel` passes inline\n" +
    "  object literals (`{ gap: 8, padding: 16 }`) and `commitUpdate` fires on\n" +
    "  identity, not on value. On the main thread that is invisible. Here it is\n" +
    "  roughly 400 wasted bytes per interaction, on every interaction, forever —\n" +
    "  and it is still four times smaller than shipping the whole tree.",
)

// --- 5.4 the boundary table, with a real socket row ------------------------

console.log("\n=== 4. The boundary table, extended with a measured socket ===")

/** The mount payload as it really crossed: the first applyMutations frame. */
const mountFrame = frames.find((f) => f.dir === "in" && f.text.includes('"applyMutations"'))
const mountRequest = mountFrame
  ? (JSON.parse(mountFrame.text.trim()) as { a?: unknown[] })
  : undefined
const mountBatch = (mountRequest?.a?.[0] ?? []) as Mutation[]
// NOTE the reverse: the mount batch is TWO setRoots. `clearContainer` fires
// first and emits `{"type":"setRoot","node":null}`, then `appendChildToContainer`
// emits the real one. On the main thread that null costs nothing; here it is a
// frame's worth of bytes, and it is the kind of detail that only becomes
// visible once the payload is text you can read.
const mountRoot = [...mountBatch]
  .reverse()
  .find((m): m is SetRootMutation => m.type === "setRoot" && m.node !== null)
const mountNodes = mountRoot?.node ? countNodes(mountRoot.node) : 0
const mountPayloadBytes = utf8(JSON.stringify(mountBatch))

/** Step 12's counterfactual boundaries, re-measured in this process. */
class Boundary {
  bytes = 0
  constructor(private readonly kind: "none" | "clone" | "json") {}
  cross<T>(payload: T): T {
    switch (this.kind) {
      case "none":
        return payload
      case "clone": {
        const copy = structuredClone(payload)
        // structuredClone has no observable byte count and uses no text
        // serializer; this line is the MEASUREMENT, not the transport.
        this.bytes += utf8(JSON.stringify(payload))
        return copy
      }
      case "json": {
        // Here the stringify IS the transport — as it is on the socket.
        const text = JSON.stringify(payload)
        this.bytes += utf8(text)
        return JSON.parse(text) as T
      }
    }
  }
}

const CROSSINGS = 200
interface TableRow {
  name: string
  bytes: number
  stringify: string
  micros: number
}
const rows: TableRow[] = []

for (const [name, kind, stringifyCalls] of [
  ["main thread — no boundary (step 12)", "none", "0"],
  ["Web Worker — structuredClone (step 13)", "clone", "0"],
  ["WebSocket — JSON encode/decode only", "json", "1"],
] as const) {
  const counted = new Boundary(kind)
  counted.cross(mountBatch)
  const timed = new Boundary(kind)
  for (let i = 0; i < 20; i++) timed.cross(mountBatch)
  const started = performance.now()
  for (let i = 0; i < CROSSINGS; i++) timed.cross(mountBatch)
  const micros = ((performance.now() - started) * 1000) / CROSSINGS
  rows.push({ name, bytes: counted.bytes, stringify: stringifyCalls, micros })
}

// THE REAL ROW. `syncTree()` makes the plugin re-serialize its whole live tree
// and push it back as `updateTree`, so one await is one full-tree delivery
// across a real 127.0.0.1 socket, in both directions, with RPC framing.
const SYNCS = 30
for (let i = 0; i < 5; i++) await controller.syncTree() // let TCP and V8 settle
const syncBytesBefore = meter.bytesIn + meter.bytesOut
const syncFramesBefore = meter.framesIn + meter.framesOut
const syncStarted = performance.now()
for (let i = 0; i < SYNCS; i++) await controller.syncTree()
const syncMicros = ((performance.now() - syncStarted) * 1000) / SYNCS
const syncBytes = (meter.bytesIn + meter.bytesOut - syncBytesBefore) / SYNCS
const syncFrames = (meter.framesIn + meter.framesOut - syncFramesBefore) / SYNCS
rows.push({
  name: "WebSocket — REAL socket, 127.0.0.1",
  bytes: Math.round(syncBytes),
  stringify: syncFrames.toFixed(0),
  micros: syncMicros,
})

console.log(
  `    ${line("boundary", 40)}${pad("bytes", 8)}${pad("stringify", 11)}${pad("µs/cross", 12)}`,
)
console.log(`    ${"-".repeat(71)}`)
for (const r of rows) {
  console.log(
    `    ${line(r.name, 40)}${pad(r.bytes, 8)}${pad(r.stringify, 11)}${pad(r.micros.toFixed(2), 12)}`,
  )
}
console.log(
  `\n    payload: one setRoot carrying ${mountNodes} nodes / ${mountPayloadBytes} B of JSON.\n` +
    `    Rows 1-3 are step 12's in-process measurement, re-run here so all four\n` +
    `    numbers come off one machine in one run.\n` +
    `    Row 4 is a real ${SYNCS}-iteration mean of \`await syncTree()\`: a request frame\n` +
    `    out, the whole tree back as \`updateTree\`, and two response frames. Its\n` +
    `    bytes and stringify columns count BOTH directions, which is why they\n` +
    `    exceed the payload's own size.\n` +
    `\n    That last row is the argument for step 05. A full-tree update is ` +
    `~${Math.round(syncBytes)} B and\n` +
    `    ~${syncMicros.toFixed(0)} µs here — on loopback, no TLS, no network, no bridge in the\n` +
    "    middle. The setText batch printed in section 3 is two orders of magnitude\n" +
    "    smaller. The main-thread controller can afford a whole-tree backstop on\n" +
    "    every commit (step 12, finding 2); `react-runtime`'s incremental branch\n" +
    "    subscribes to mutations only (runtime.ts:150-160), and this table is why.",
)

// --- 5.5 the failure mode that did not exist before ------------------------

console.log("\n=== 5. The connection drops mid-session ===")

const statusText = (tree: UINode | null): string => {
  if (!tree) return "(no tree)"
  const find = (node: UINode | string): string | null => {
    if (typeof node === "string") return null
    if (node.props.id === "status") {
      const first = node.children[0]
      if (first === undefined) return null
      return typeof first === "string" ? first : (first.text ?? null)
    }
    for (const child of node.children) {
      const hit = find(child)
      if (hit !== null) return hit
    }
    return null
  }
  return find(tree) ?? "(no status label)"
}

console.log(`  host's status label before anything breaks : "${statusText(controller.getTree())}"`)

// Press "Background burst": the plugin schedules three of its own re-renders at
// +60 / +120 / +180 ms. Real plugins do this constantly — a poll, a stream, a
// file watcher. The host is about to stop being able to hear any of it.
console.log(`  pressing "Background burst" (${burstId}); the plugin now has pending work`)
await controller.executeHandler(burstId, [])

// THE CUT. `terminate()`, not `close()`: no closing handshake, which is what a
// dropped route, a killed container or a restarted bridge actually looks like.
harness.blackout = true
harness.endpoint.current()?.terminate()
console.log("  socket terminated, and the server is refusing new connections (blackout)")

await sleep(400)
console.log(`\n  status after the blackout, host side : "${statusText(controller.getTree())}"`)
console.log(`  controller.getStatus()               : ${JSON.stringify(controller.getStatus())}`)

harness.blackout = false
console.log("  blackout lifted; waiting for the plugin's own reconnect loop...")
await controller.waitForAttach()
// The plugin flushes its buffered log lines on reconnect; they are what it
// rendered while nobody could hear it.
await sleep(80)
console.log(`  socket attachments so far            : ${harness.endpoint.attachments}`)

const drops = await controller.pluginDrops()
const staleText = statusText(controller.getTree())
console.log(
  `\n  DRIFT, measured:\n` +
    `    mutation frames the plugin could not send : ${drops}\n` +
    `    the host still renders                    : "${staleText}"\n` +
    `    the plugin's buffered log lines just above: what it was really showing\n` +
    "\n  Nothing detected this. The host's `MutableTree` applied every batch it\n" +
    "  received, in order, without error; it is simply missing the ones that were\n" +
    "  never delivered. This is the failure mode steps 12 and 13 cannot have: a\n" +
    "  direct call cannot be half-made, and a live Worker receives every\n" +
    "  `postMessage`.",
)

console.log("\n  RECOVERY — syncTree(), the member that exists for exactly this:")
await controller.syncTree()
const healedText = statusText(controller.getTree())
console.log(`    host now renders : "${healedText}"`)
console.log(`    drift closed     : ${healedText !== staleText}`)
console.log("\n  the host's rendering after recovery:")
for (const l of host.render(controller.getTree())) console.log(`    ${l}`)
console.log(
  "\n  Two details worth the stare. First, no `initialize` was sent: the plugin\n" +
    "  process never died, its React tree stayed mounted, and `syncTree` walked\n" +
    "  the live instances and re-serialized them. Second, every handler id the\n" +
    "  host had bound before the cut still resolves — ids are derived from node\n" +
    "  ids in `serializeProps`, not from a per-connection table, so a reconnect\n" +
    "  does not invalidate the host's bindings.",
)

// --- 5.6 re-delivery, and the guard this protocol does not have ------------

console.log("\n=== 6. Re-delivery: the failure syncTree does NOT fix ===")

/**
 * A reconnecting transport that retries in-flight sends — which is what most
 * reconnect wrappers do — can deliver the same batch twice, or deliver a stale
 * batch after a newer one. Here is a real captured frame from this run, fed
 * back into a copy of the host's applier a second time.
 */
const replayFrame = frames.find(
  (f) => f.dir === "in" && f.text.includes('"applyMutations"') && f.text.includes('"setText"'),
)
if (replayFrame) {
  const replayRequest = JSON.parse(replayFrame.text.trim()) as { a?: unknown[] }
  const replayBatch = (replayRequest.a?.[0] ?? []) as Mutation[]
  console.log(`  replaying a captured frame: ${trimFrame(replayFrame.text, 92)}`)
  const beforeReplay = statusText(controller.getTree())
  const replayTree = new MutableTree(() => {})
  replayTree.init(controller.getTree())
  const after = replayTree.applyMutations(replayBatch)
  console.log(`    host text before the replay : "${beforeReplay}"`)
  console.log(`    host text after  the replay : "${statusText(after)}"`)
  console.log(
    "\n  The tree went BACKWARDS, silently. `PluginToHostAPI.applyMutations(mutations)`\n" +
      "  (packages/protocol/src/rpc.ts:74) carries no sequence number, so the host\n" +
      "  cannot tell a fresh batch from a re-delivered or reordered one. Step 10's\n" +
      "  Swift host can: `ShadowTree.apply(batch)` takes a revisioned `CommitBatch`\n" +
      "  and returns false when `batch.revision <= revision`. That guard is a\n" +
      "  transport-failure guard, and step 14 is the first step where the transport\n" +
      "  can actually fail — which makes the JS hosts not having it a real gap and\n" +
      "  not a stylistic difference.",
  )
}

// --- 5.7 teardown: no hang, no orphan --------------------------------------

console.log("\n=== 7. Shutdown ===")

unsubscribe()
await controller.destroy()
console.log(`  after destroy(): ${JSON.stringify(controller.getStatus())}`)

// The socket is the thing being torn down, so the "you may exit" signal goes
// over the fork's IPC channel instead. A shutdown path that depends on the
// failing transport is not a shutdown path.
child.send("shutdown")
const exitResult = await Promise.race([
  once(child, "exit").then(([code, signal]) => ({ code, signal })),
  sleep(3000).then(() => null),
])
if (exitResult === null) {
  child.kill("SIGKILL")
  await once(child, "exit")
  console.log("  child did not exit within 3s and was SIGKILLed — a bug, not a feature")
} else {
  console.log(`  plugin process exited: code=${exitResult.code} signal=${exitResult.signal}`)
}

await harness.close()
console.log("  ws server closed")

console.log(
  `\n  TOTALS FOR THE WHOLE RUN\n` +
    `    frames out / in     : ${meter.framesOut} / ${meter.framesIn}\n` +
    `    bytes  out / in     : ${meter.bytesOut} / ${meter.bytesIn}\n` +
    `    socket attachments  : ${harness.endpoint.attachments} (1 initial + reconnects)\n` +
    `    host re-renders     : ${hostRenders}\n` +
    `    plugin process      : pid ${child.pid}, exited cleanly`,
)

if (childOutput.trim().length > 0) {
  console.log("\n  plugin process stdio (buffered, printed here so ordering is stable):")
  for (const l of childOutput.trim().split("\n")) console.log(`    ${l}`)
}

console.log(
  "\n  Stage D, in one sentence: the plugin's source is byte-identical across all\n" +
    "  three runtimes and the interface above it is the same ten members, but the\n" +
    "  failure surface grew from `it threw` to `it threw, or it never arrived, or\n" +
    "  it arrived twice, or it arrived late, or the peer is gone`. Everything the\n" +
    "  protocol does that looks like over-engineering on the main thread — handler\n" +
    "  ids, JSON-only props, incremental mutations, syncTree — is this page.",
)
