type Handler = (...args: unknown[]) => unknown;

export class HandlerRegistry {
  private handlers: Map<string, Handler> = new Map();
  private idCounter = 0;

  register(handler: Handler): string {
    const id = `handler_${this.idCounter++}`;
    this.handlers.set(id, handler);
    return id;
  }

  async execute(handlerId: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(handlerId);
    if (!handler) {
      return;
    }

    const result = handler(...args);
    if (result instanceof Promise) {
      return await result;
    }
    return result;
  }

  has(handlerId: string): boolean {
    return this.handlers.has(handlerId);
  }

  remove(handlerId: string): void {
    this.handlers.delete(handlerId);
  }

  clear(): void {
    this.handlers.clear();
    this.idCounter = 0;
  }

  get size(): number {
    return this.handlers.size;
  }
}
