/**
 * Step 14 — the protocol, and the wire it now has to survive.
 *
 * Two processes cannot share a type declaration by luck, so this module is
 * imported by BOTH `main.ts` (the host) and `plugin-process.ts` (the plugin,
 * running under its own PID). That is not a shortcut around learn/RULES.md's
 * "steps do not import each other" — it is the same step's two halves sharing
 * the one thing they are contractually required to agree on. In the real repo
 * that shared thing is a published package, `@uniview/protocol`, imported by
 * `packages/host-sdk` and `packages/react-runtime` alike.
 *
 * What is genuinely new in this file, versus steps 12/13, is everything below
 * the `UINode`/`Mutation` declarations: a wire. Frames, ids, request/response
 * matching, and a byte counter — because from here on the boundary is not an
 * implementation detail of `postMessage`, it is a socket someone can unplug.
 */

// ===========================================================================
// 1. The contract, unchanged since step 01
// ===========================================================================

/** The only value kinds allowed in props: whatever a Swift decoder can rebuild. */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue }

/** Reserved node type for text content. Text is a node so mutations can address it. */
export const TEXT_NODE_TYPE = "#text"

export interface UINode {
  id: string
  type: string
  props: Record<string, JSONValue>
  children: (UINode | string)[]
  text?: string
}

/**
 * A function cannot cross a Worker boundary — and it cannot cross a socket
 * either, except that a socket does not even complain. `JSON.stringify` drops a
 * function property silently. So the `HandlerId` indirection stops being a
 * structured-clone workaround and becomes the only reason event handling works
 * at all.
 */
export type HandlerId = string

export interface AppendChildMutation {
  type: "appendChild"
  parentId: string
  node: UINode
}

export interface InsertBeforeMutation {
  type: "insertBefore"
  parentId: string
  node: UINode
  beforeId: string
}

export interface RemoveChildMutation {
  type: "removeChild"
  parentId: string
  nodeId: string
}

export interface SetTextMutation {
  type: "setText"
  nodeId: string
  text: string
}

export interface SetPropsMutation {
  type: "setProps"
  nodeId: string
  props: Record<string, JSONValue>
}

export interface SetRootMutation {
  type: "setRoot"
  node: UINode | null
}

export type Mutation =
  | AppendChildMutation
  | InsertBeforeMutation
  | RemoveChildMutation
  | SetTextMutation
  | SetPropsMutation
  | SetRootMutation

/**
 * `packages/protocol/src/version.ts:9` — `export const PROTOCOL_VERSION = 3;`
 *
 * On the main thread this number is decoration: one heap, one build, one
 * version by construction. Over a socket the two ends are separately deployed
 * artifacts that can be months apart, so `initialize` carries it and the plugin
 * throws on mismatch (`react-runtime/src/runtime.ts:55-61`). Step 14 is the
 * first step where that check can actually fire.
 */
export const PROTOCOL_VERSION = 3

// ===========================================================================
// 2. The two RPC surfaces — packages/protocol/src/rpc.ts, member for member
// ===========================================================================

export interface InitializeRequest {
  protocolVersion: number
  props?: JSONValue
}

/** What the plugin exposes. The host calls these. */
export interface HostToPluginAPI {
  initialize(req: InitializeRequest): Promise<void>
  updateProps(props: JSONValue): Promise<void>
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>
  syncTree(): Promise<void>
  destroy(): Promise<void>
}

/** What the host exposes. The plugin calls these. */
export interface PluginToHostAPI {
  updateTree(tree: UINode | null): void
  applyMutations(mutations: Mutation[]): void
  log(level: "log" | "info" | "warn" | "error", args: JSONValue[]): void
  reportError(err: { message: string; stack?: string }): void
}

// ===========================================================================
// 3. The wire format
// ===========================================================================
//
// kkrpc's compact records, copied from its published types
// (`kkrpc/dist/protocol-*.d.ts`): a request is `{t:"q", id, op, p, a}` and a
// response is `{t:"r", id, v|e}`. `p` is a PROPERTY PATH, which is why
// `rpc.getAPI().applyMutations(x)` can be written as a method call and still be
// one flat JSON object on the wire.
//
// Frames are newline-terminated JSON text. That is not a guess: the real bridge
// normalizes every forwarded message with
//
//     if (!msgStr.endsWith("\n")) msgStr += "\n";
//
// (`examples/bridge-server/src/bridge.ts:54-59`) precisely because the peer may
// be reading a byte stream rather than discrete WebSocket frames.

export interface RPCRequest {
  t: "q"
  id: string
  op: "call"
  /** Property path on the exposed API, e.g. `["applyMutations"]`. */
  p: string[]
  a?: unknown[]
}

export interface RPCResponse {
  t: "r"
  id: string
  v?: unknown
  e?: { n: string; m: string; s?: string }
}

export type RPCMessage = RPCRequest | RPCResponse

// ===========================================================================
// 4. Instrumentation shared by both processes
// ===========================================================================

/** UTF-8 byte size, because that is what the socket actually carries. */
export const utf8 = (value: string): number => new TextEncoder().encode(value).length

/**
 * Absolute wall-clock milliseconds, float. `performance.now()` alone is useless
 * here: it counts from each PROCESS's own origin, and this step has two of
 * them. Adding `timeOrigin` puts both on the same epoch so the hop trace in
 * `main.ts` can interleave host hops and plugin hops in real order.
 */
export const epochNow = (): number => performance.timeOrigin + performance.now()

export interface Hop {
  at: number
  where: "host" | "controller" | "wire" | "plugin"
  what: string
}

export type FrameDirection = "out" | "in"

export interface FrameRecord {
  at: number
  dir: FrameDirection
  bytes: number
  text: string
}

// ===========================================================================
// 5. WireLink — the one thing steps 12 and 13 did not need
// ===========================================================================
//
// A minimal bidirectional JSON-RPC channel over one socket. This is the
// teaching stand-in for `new RPCChannel(transport, { expose })`; kkrpc does
// callbacks, streams, remote refs, superjson codecs and transferables on top,
// and none of that is needed to see the shape.
//
// `WireLink` is deliberately transport-shaped rather than WebSocket-shaped: it
// takes anything with `send`/`close`/`readyState`, exactly as kkrpc's
// `webSocketTransport()` takes a `WebSocketLike`. The socket can therefore be
// swapped, dropped and replaced without the RPC layer above it knowing —
// which is what section 5 of `main.ts` does for real.

/** The `WebSocketLike` shape kkrpc's ws transport accepts, narrowed to what is used. */
export interface SocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  on(event: "message", cb: (data: unknown) => void): this
  on(event: "close", cb: (code: number, reason: unknown) => void): this
  on(event: "error", cb: (err: Error) => void): this
}

/** `WebSocket.OPEN`. Spelled out so this module needs no `ws` import. */
export const WS_OPEN = 1

export interface WireLinkOptions {
  /** Called for every frame in both directions, before send / after receive. */
  onFrame?: (record: FrameRecord) => void
  /** Called when a frame could not be written because the socket was not open. */
  onDropped?: (record: FrameRecord) => void
}

export class WireLink {
  bytesOut = 0
  bytesIn = 0
  framesOut = 0
  framesIn = 0
  /** Frames this side tried to send while the socket was not OPEN. */
  framesDropped = 0

  private nextId = 1
  private readonly pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  private closed = false

  constructor(
    private readonly socket: SocketLike,
    /** The API this side exposes. Keys are the `p[0]` of an incoming request. */
    private readonly expose: Record<string, (...args: never[]) => unknown>,
    private readonly opts: WireLinkOptions = {},
  ) {
    socket.on("message", (data: unknown) => {
      // One WebSocket frame may carry more than one newline-terminated record —
      // the bridge concatenates when it flushes buffered host messages
      // (bridge.ts:154-162). Splitting on "\n" is what makes that safe.
      const text = String(data)
      for (const line of text.split("\n")) {
        if (line.trim() === "") continue
        this.receive(line)
      }
    })
    socket.on("close", () => {
      this.failAllPending("socket closed")
    })
    socket.on("error", () => {
      this.failAllPending("socket error")
    })
  }

  /**
   * Call a method on the OTHER process. Note the signature: it can only ever
   * take JSON. There is no overload that takes a callback, because there is no
   * way to put one in a frame.
   */
  call(method: string, args: unknown[]): Promise<unknown> {
    const id = String(this.nextId++)
    const request: RPCRequest = { t: "q", id, op: "call", p: [method], a: args }
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      if (!this.write(request)) {
        this.pending.delete(id)
        // The real failure mode, not a thrown exception: the plugin rendered,
        // produced a mutation batch, and had nowhere to put it.
        resolve(undefined)
      }
    })
  }

  private write(message: RPCMessage): boolean {
    // The stringify IS the transport now. In step 12 this line did not exist;
    // in step 13 it existed only as the measurement of a structuredClone.
    const text = JSON.stringify(message) + "\n"
    const bytes = utf8(text)
    const record: FrameRecord = { at: epochNow(), dir: "out", bytes, text }

    if (this.closed || this.socket.readyState !== WS_OPEN) {
      this.framesDropped += 1
      this.opts.onDropped?.(record)
      return false
    }

    this.framesOut += 1
    this.bytesOut += bytes
    this.opts.onFrame?.(record)
    this.socket.send(text)
    return true
  }

  private receive(line: string): void {
    const bytes = utf8(line + "\n")
    this.framesIn += 1
    this.bytesIn += bytes
    this.opts.onFrame?.({ at: epochNow(), dir: "in", bytes, text: line + "\n" })

    let message: RPCMessage
    try {
      message = JSON.parse(line) as RPCMessage
    } catch {
      return
    }

    if (message.t === "r") {
      const waiter = this.pending.get(message.id)
      if (!waiter) return
      this.pending.delete(message.id)
      if (message.e) waiter.reject(new Error(`${message.e.n}: ${message.e.m}`))
      else waiter.resolve(message.v)
      return
    }

    void this.dispatch(message)
  }

  private async dispatch(request: RPCRequest): Promise<void> {
    const name = request.p[0] ?? ""
    const method = this.expose[name]
    if (!method) {
      this.write({ t: "r", id: request.id, e: { n: "TypeError", m: `no method ${name}` } })
      return
    }
    try {
      const value = await (method as (...a: unknown[]) => unknown)(...(request.a ?? []))
      const response: RPCResponse = { t: "r", id: request.id }
      if (value !== undefined) response.v = value
      this.write(response)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.write({
        t: "r",
        id: request.id,
        e: { n: err.name, m: err.message, ...(err.stack ? { s: err.stack } : {}) },
      })
    }
  }

  private failAllPending(reason: string): void {
    if (this.pending.size === 0) return
    const waiters = [...this.pending.values()]
    this.pending.clear()
    // Every in-flight call becomes an error the instant the wire goes. This is
    // the member of the failure surface that steps 12 and 13 do not have:
    // `executeHandler`'s Promise can now reject for reasons that have nothing
    // to do with the handler.
    for (const w of waiters) w.reject(new Error(`wire: ${reason}`))
  }

  destroy(): void {
    this.closed = true
    this.failAllPending("channel destroyed")
  }
}

// ===========================================================================
// 6. Printing helpers used by both processes
// ===========================================================================

export const pad = (s: string | number, n: number): string => String(s).padStart(n)
export const line = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - s.length))

/** Trim a frame's text for printing, keeping the head where the shape lives. */
export function trimFrame(text: string, max = 118): string {
  const flat = text.replace(/\n$/, "")
  if (flat.length <= max) return flat
  return `${flat.slice(0, max)}… (+${flat.length - max} chars)`
}
