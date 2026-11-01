import type { QueueName } from "../contracts/queues.js";
import type { EventMap, EventName } from "../contracts/event-map.js";

export interface MessageMetadata {
  type: EventName;
  queue: QueueName;
  messageId: string;
  timestamp: number;
  retryCount: number;
  redelivered: boolean;
  correlationId: string;
  headers?: Record<string, unknown>;
}

export interface RetryOptions {
  factor?: number;
  maxDelayMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
}

export type ResolvedRetryOptions = Required<RetryOptions>;

export const DEFAULT_RETRY_OPTIONS: ResolvedRetryOptions = {
  factor: 2,
  maxRetries: 3,
  maxDelayMs: 30_000,
  initialDelayMs: 1_000,
};

export interface SubscribeOptions {
  /** Max handlers running at once for this queue. Equivalent of RabbitMQ prefetch. */
  concurrency?: number;
  /** Maximum buffered messages for new publishes. A full queue rejects the publish. */
  maxQueueSize?: number;
  /** Delayed retry with exponential backoff. Omit to dead-letter on first failure. */
  retry?: RetryOptions;
}

export interface PublishOptions {
  messageId?: string;
  persistent?: boolean;
  correlationId: string;
  headers?: Record<string, unknown>;
}

export type PublishErrorCode = "NO_SUBSCRIBERS" | "QUEUE_FULL";

export interface PublishQueueCapacity {
  queue: string;
  buffered: number;
  maxBuffered: number;
}

export class PublishError extends Error {
  constructor(
    public readonly code: PublishErrorCode,
    public readonly event: EventName,
    public readonly messageId: string,
    public readonly queues: readonly PublishQueueCapacity[] = [],
  ) {
    const queueSummary = queues
      .map(
        ({ queue, buffered, maxBuffered }) =>
          `${queue} (${buffered}/${maxBuffered})`,
      )
      .join(", ");

    const message =
      code === "NO_SUBSCRIBERS"
        ? `Cannot publish "${event}": no subscribers are registered.`
        : `Cannot publish "${event}": queue capacity is full (${queueSummary}).`;

    super(message);
    this.name = "PublishError";
  }
}

export interface DeadLetter {
  error: string;
  queue: QueueName;
  event: EventName;
  payload: unknown;
  failedAt: number;
  messageId: string;
  retryCount: number;
  correlationId: string;
}

export interface QueueStats {
  active: number;
  isFull: boolean;
  retrying: number;
  buffered: number;
  maxBuffered: number;
  deadLettered: number;
}

export type MessageHandler<K extends EventName> = (
  payload: EventMap[K],
  metadata: MessageMetadata,
) => Promise<void> | void;

export interface IPublisher {
  /**
   * Rejects with PublishError if there are no subscribers or any target queue
   * lacks buffer capacity. Resolving confirms enqueue only, not handler success.
   */
  publish<K extends EventName>(
    event: K,
    payload: EventMap[K],
    options: PublishOptions,
  ): Promise<void>;
}

export interface IConsumer {
  subscribe<K extends EventName>(
    queue: QueueName,
    event: K,
    handler: MessageHandler<K>,
    options?: SubscribeOptions,
  ): Promise<void>;

  requeueDlqMessages(
    queue: QueueName,
    options?: { limit?: number; resetRetryCount?: boolean },
  ): Promise<{ requeued: number; failed: number }>;

  close(): Promise<void>;
}
