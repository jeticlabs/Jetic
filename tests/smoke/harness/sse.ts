export type SseEvent = Record<string, any> & { type?: string };

/**
 * Minimal Server-Sent Events reader for `fetch` responses whose frames are `data: <json>\n\n`
 * (comment frames such as `: heartbeat` are ignored). Events are buffered, so tests can look at
 * what already arrived and wait for what has not.
 */
export class SseStream {
  readonly events: SseEvent[] = [];
  /** Resolves when the server closes the stream. */
  readonly ended: Promise<void>;
  private listeners = new Set<() => void>();
  private controller = new AbortController();

  private constructor(response: Response) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    this.ended = (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
            if (!data) continue;
            this.events.push(JSON.parse(data));
            this.listeners.forEach((notify) => notify());
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') throw err;
      } finally {
        this.listeners.forEach((notify) => notify());
      }
    })();
  }

  /** Opens `url` (any fetch init, e.g. a POST body) and starts reading. */
  static async open(url: string, init: RequestInit = {}): Promise<SseStream & { response: Response }> {
    const controller = new AbortController();
    const response = await fetch(url, { ...init, signal: controller.signal });
    const stream = new SseStream(response) as SseStream & { response: Response };
    stream.controller = controller;
    stream.response = response;
    return stream;
  }

  /** The first event matching `match` (a `type` string or predicate), whether it already arrived or not. */
  async waitFor(match: string | ((event: SseEvent) => boolean), timeoutMs = 15_000): Promise<SseEvent> {
    const test = typeof match === 'string' ? (e: SseEvent) => e.type === match : match;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.events.find(test);
      if (found) return found;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for SSE event ${typeof match === 'string' ? match : '(predicate)'}; got: ${this.events.map((e) => e.type).join(', ') || 'nothing'}`);
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, 100);
        const listener = () => done();
        function done() {
          clearTimeout(timer);
          resolve();
        }
        this.listeners.add(listener);
        setTimeout(() => this.listeners.delete(listener), 150);
      });
    }
  }

  /** Reads until the server ends the stream, then returns every event. */
  async all(timeoutMs = 60_000): Promise<SseEvent[]> {
    await Promise.race([
      this.ended,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`SSE stream did not end within ${timeoutMs} ms; got: ${this.events.map((e) => e.type).join(', ')}`)), timeoutMs)),
    ]);
    return this.events;
  }

  types(): string[] {
    return this.events.map((e) => String(e.type));
  }

  close(): void {
    this.controller.abort();
  }
}
