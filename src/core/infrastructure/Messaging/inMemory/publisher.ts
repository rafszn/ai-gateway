import type { InMemoryBroker } from "./in-memory-broker.js";
import type { IPublisher, PublishOptions } from "./types.js";
import type { EventMap, EventName } from "../contracts/event-map.js";

export class Publisher implements IPublisher {
  constructor(private readonly broker: InMemoryBroker) {}

  /**
   * Resolves once the message is enqueued for every subscribed queue.
   * Handlers run later and their failures never reach the publisher.
   */
  public async publish<K extends EventName>(
    event: K,
    payload: EventMap[K],
    options: PublishOptions,
  ): Promise<void> {
    this.broker.publish(event, payload, options);
  }
}
