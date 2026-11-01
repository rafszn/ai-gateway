import { container } from "tsyringe";
import { Consumer } from "./consumer.js";
import { Publisher } from "./publisher.js";
import { MessagingTokens } from "../tokens.js";
import {
  InMemoryBroker,
  type InMemoryBrokerOptions,
} from "./in-memory-broker.js";
import type { IConsumer, IPublisher } from "./types.js";

/**
 * Creates the in-process broker and registers a Publisher and Consumer under
 * the same tsyringe tokens the RabbitMQ setup uses.
 *
 * import "reflect-metadata" in the entry file first.
 *
 *   const messaging = initiateInMemoryMessaging({ defaultConcurrency: 5 });
 *
 *   const consumer = container.resolve<IConsumer>(MessagingTokens.Consumer);
 *   await consumer.subscribe(QUEUES.EMAIL, "user.created", sendWelcomeEmail, {
 *     retry: { maxRetries: 3 },
 *   });
 *
 *   const publisher = container.resolve<IPublisher>(MessagingTokens.Publisher);
 *   await publisher.publish("user.created", payload, { correlationId });
 *
 *   // On SIGTERM, after the HTTP server stops accepting requests:
 *   await messaging.consumer.close();
 *
 * Register every subscriber before the server starts handling requests:
 * events published before a queue subscribes are not delivered to it.
 */
export function initiateInMemoryMessaging(
  options: InMemoryBrokerOptions = {},
): void {
  const broker = new InMemoryBroker({ ...options });
  const publisher = new Publisher(broker);
  const consumer = new Consumer(broker);

  container.registerInstance<InMemoryBroker>(
    MessagingTokens.MemoryBroker,
    broker,
  );
  container.registerInstance<IPublisher>(MessagingTokens.Publisher, publisher);
  container.registerInstance<IConsumer>(MessagingTokens.Consumer, consumer);
}
