import type {
  MessageExtraInfo,
  JSONRPCMessage,
  RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';

function isInboundRequest(message: JSONRPCMessage): boolean {
  return (
    'method' in message &&
    'id' in message &&
    (message as { id?: unknown }).id !== undefined
  );
}

function isResponse(message: JSONRPCMessage): boolean {
  return !('method' in message) && 'id' in message;
}

/**
 * A Transport decorator that delivers inbound client **requests** to the SDK
 * strictly one at a time, in arrival order.
 *
 * Why: the MCP SDK dispatches incoming requests concurrently. For a stateful
 * read-modify-write server like Jetic (every mutating tool does
 * load → modify → save of `.jetic/model.json`), two pipelined calls — e.g. an
 * agent firing `jetic_add_endpoint` + `jetic_get_endpoint` in one block, or a
 * burst buffered while the process starts — can otherwise execute out of order
 * (observed: GET running before a previously-sent ADD) and read stale state.
 *
 * How: notifications and responses pass through immediately; each inbound
 * request is held until the response for the previous request leaves via
 * `send()`. A `notifications/cancelled` for the pending request also releases
 * the gate so a cancelled call can never wedge the server.
 *
 * This only uses the public Transport contract, so it is independent of SDK
 * internals and safe across SDK upgrades.
 */
export class SerializedTransport implements Transport {
  public onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;

  public get sessionId(): string | undefined {
    return this.inner.sessionId;
  }

  private readonly queue: Array<{ message: JSONRPCMessage; extra?: MessageExtraInfo }> = [];
  private pendingRequestId: RequestId | undefined;
  private started = false;

  constructor(private readonly inner: Transport) {
    this.inner.onmessage = (message, extra) => this.enqueue(message, extra);
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = (error) => this.onerror?.(error);
  }

  public async start(): Promise<void> {
    if (!this.started) {
      this.started = true;
      await this.inner.start();
    }
  }

  public async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    await this.inner.send(message, options);
    const id = (message as { id?: RequestId }).id;
    const released =
      (isResponse(message) && id === this.pendingRequestId) ||
      (options?.relatedRequestId !== undefined && options.relatedRequestId === this.pendingRequestId);
    if (released) {
      this.pendingRequestId = undefined;
      this.pump();
    }
  }

  public async close(): Promise<void> {
    await this.inner.close();
  }

  public setProtocolVersion?(version: string): void {
    this.inner.setProtocolVersion?.(version);
  }

  private enqueue(message: JSONRPCMessage, extra?: MessageExtraInfo): void {
    // A cancellation for the pending request releases the gate immediately,
    // so a cancelled call whose handler never produces a response can never
    // wedge the server. (Checked here — not in pump() — because pump()
    // returns early while a request is pending.)
    if (
      !isInboundRequest(message) &&
      (message as { method?: string }).method === 'notifications/cancelled' &&
      (message as { params?: { requestId?: RequestId } }).params?.requestId ===
        this.pendingRequestId
    ) {
      this.pendingRequestId = undefined;
    }
    this.queue.push({ message, extra });
    this.pump();
  }

  private pump(): void {
    if (this.pendingRequestId !== undefined) return;
    while (this.queue.length > 0) {
      const next = this.queue[0];
      // Notifications and responses always flow through immediately.
      if (!isInboundRequest(next.message)) {
        this.queue.shift();
        this.onmessage?.(next.message as never, next.extra);
        continue;
      }
      this.pendingRequestId = (next.message as { id: RequestId }).id;
      this.queue.shift();
      this.onmessage?.(next.message as never, next.extra);
      return; // wait for this request's response before delivering more
    }
  }
}
