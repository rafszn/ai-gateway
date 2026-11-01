import type { InMemoryBroker } from "./in-memory-broker.js";
import type { IPublisher, PublishOptions } from "./types.js";
import type { EventMap, EventName } from "../contracts/event-map.js";

export class Publisher implements IPublisher {
  constructor(private readonly broker: InMemoryBroker) {}

  /**
   * Resolves after enqueueing into every subscribed queue.
   * Rejects if there are no subscribers or any target queue is full.
   * Handler execution and its failures happen after this promise resolves.
   */
  public async publish<K extends EventName>(
    event: K,
    payload: EventMap[K],
    options: PublishOptions,
  ): Promise<void> {
    this.broker.publish(event, payload, options);
  }
}
