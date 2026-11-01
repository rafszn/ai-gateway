import type { EventName } from "../contracts/event-map.js";
import type { InMemoryBroker } from "./in-memory-broker.js";
import type { IConsumer, MessageHandler, SubscribeOptions } from "./types.js";

export class Consumer implements IConsumer {
  constructor(private readonly broker: InMemoryBroker) {}

  public async subscribe<K extends EventName>(
    queue: string,
    event: K,
    handler: MessageHandler<K>,
    options: SubscribeOptions = {},
  ): Promise<void> {
    this.broker.subscribe<K>(queue, event, handler, options);
  }

  public async requeueDlqMessages(
    queue: string,
    options: { limit?: number; resetRetryCount?: boolean } = {},
  ): Promise<{ requeued: number; failed: number }> {
    return this.broker.requeueDeadLetters(queue, options);
  }

  /** Graceful: drains in-flight and buffered work before resolving. */
  public async close(): Promise<void> {
    await this.broker.close();
  }
}
