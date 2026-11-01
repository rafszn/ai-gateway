import {
  PublishError,
  type DeadLetter,
  type QueueStats,
  type RetryOptions,
  type PublishOptions,
  type MessageMetadata,
  type SubscribeOptions,
  DEFAULT_RETRY_OPTIONS,
  type PublishQueueCapacity,
  type ResolvedRetryOptions,
} from "./types.js";
import { Fifo } from "./fifo.js";
import { randomUUID } from "node:crypto";
import logger from "../../../../config.js";
import type { QueueName } from "../contracts/queues.js";
import type { EventMap, EventName } from "../contracts/event-map.js";

export interface InMemoryBrokerOptions {
  maxDeadLetters?: number;
  shutdownTimeoutMs?: number;
  defaultConcurrency?: number;
  defaultMaxQueueSize?: number;
  onRejected?: (
    info: PublishQueueCapacity & {
      event: EventName;
      messageId: string;
      reason: "QUEUE_FULL";
    },
  ) => void;
  onDeadLetter?: (deadLetter: DeadLetter) => void;
}

type Handler = (
  payload: unknown,
  metadata: MessageMetadata,
) => Promise<void> | void;

interface Envelope {
  id: string;
  event: EventName;
  payload: unknown;
  correlationId: string;
  timestamp: number;
  headers?: Record<string, unknown>;
  retryCount: number;
}

interface DeadEntry {
  envelope: Envelope;
  error: string;
  failedAt: number;
}

interface QueueConfig {
  concurrency: number;
  maxQueueSize: number;
  retry?: ResolvedRetryOptions;
}

interface QueueState extends QueueConfig {
  name: string;
  handlers: Map<EventName, Handler>;
  buffer: Fifo<Envelope>;
  active: number;
  scheduled: boolean;
  /** Messages waiting out their backoff. They hold no concurrency slot. */
  retrying: Map<ReturnType<typeof setTimeout>, Envelope>;
  deadLetters: DeadEntry[];
}

export class InMemoryBroker {
  private closed = false;
  private closePromise: Promise<void> | null = null;
  private readonly idleWaiters: Array<() => void> = [];
  private readonly queues = new Map<string, QueueState>();
  private readonly routes = new Map<EventName, Set<QueueState>>();

  private readonly maxDeadLetters: number;
  private readonly shutdownTimeoutMs: number;
  private readonly defaultConcurrency: number;
  private readonly defaultMaxQueueSize: number;
  private readonly onRejected?: InMemoryBrokerOptions["onRejected"];
  private readonly onDeadLetter?: InMemoryBrokerOptions["onDeadLetter"];

  constructor(options: InMemoryBrokerOptions = {}) {
    this.onRejected = options.onRejected;
    this.onDeadLetter = options.onDeadLetter;
    this.maxDeadLetters = options.maxDeadLetters ?? 1_000;
    this.defaultConcurrency = options.defaultConcurrency ?? 10;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;
    this.defaultMaxQueueSize = options.defaultMaxQueueSize ?? 100_000;

    assertPositiveInt("maxDeadLetters", this.maxDeadLetters);
    assertPositiveInt("defaultConcurrency", this.defaultConcurrency);
    assertPositiveInt("defaultMaxQueueSize", this.defaultMaxQueueSize);
  }

  public publish<K extends EventName>(
    event: K,
    payload: EventMap[K],
    options: PublishOptions,
  ): void {
    this.ensureOpen();

    const messageId = options.messageId ?? randomUUID();
    const targetQueues = [...(this.routes.get(event) ?? [])];

    if (targetQueues.length === 0) {
      throw new PublishError("NO_SUBSCRIBERS", event, messageId);
    }

    const fullQueues = targetQueues.filter(
      (queue) => queue.buffer.length >= queue.maxQueueSize,
    );

    if (fullQueues.length > 0) {
      const capacities = fullQueues.map((queue) =>
        this.reportQueueFull(queue, event, messageId),
      );

      throw new PublishError("QUEUE_FULL", event, messageId, capacities);
    }

    const timestamp = Date.now();

    // Clone every delivery before enqueueing any of them. A clone failure
    // therefore cannot leave only some subscriber queues with the event.
    const deliveries = targetQueues.map((queue) => ({
      queue,
      envelope: {
        event,
        timestamp,
        retryCount: 0,
        id: messageId,
        correlationId: options.correlationId,
        payload: cloneOrThrow(event, payload),
        headers: options.headers && cloneOrThrow(event, options.headers),
      },
    }));

    for (const { queue, envelope } of deliveries) {
      this.enqueueAccepted(queue, envelope);
    }

    logger.info("[Messaging] Message published", {
      event,
      messageId,
      queues: targetQueues.length,
      correlationId: options.correlationId,
    });
  }

  public subscribe<K extends EventName>(
    queueName: string,
    event: K,
    handler: (
      payload: EventMap[K],
      metadata: MessageMetadata,
    ) => Promise<void> | void,
    options: SubscribeOptions = {},
  ): void {
    this.ensureOpen();

    const config = this.resolveConfig(options);
    let queue = this.queues.get(queueName);

    if (queue) {
      this.warnOnConfigDrift(queue, options, config);
    } else {
      queue = {
        ...config,
        active: 0,
        deadLetters: [],
        name: queueName,
        scheduled: false,
        buffer: new Fifo(),
        handlers: new Map(),
        retrying: new Map(),
      };
      this.queues.set(queueName, queue);
    }

    if (queue.handlers.has(event)) {
      throw new Error(
        `A handler for event "${event}" is already registered on queue "${queueName}".`,
      );
    }

    queue.handlers.set(event, handler as Handler);

    let subscribers = this.routes.get(event);
    if (!subscribers) {
      subscribers = new Set();
      this.routes.set(event, subscribers);
    }
    subscribers.add(queue);
    logger.info(`[Messaging] Subscribed: "${event}" -> queue "${queueName}".`);
  }

  public getDeadLetters(queueName: QueueName): DeadLetter[] {
    const queue = this.queues.get(queueName);

    return (queue?.deadLetters ?? []).map(({ envelope, error, failedAt }) => ({
      error,
      failedAt,
      queue: queueName,
      event: envelope.event,
      messageId: envelope.id,
      payload: envelope.payload,
      retryCount: envelope.retryCount,
      correlationId: envelope.correlationId,
    }));
  }

  public requeueDeadLetters(
    queueName: string,
    options: { limit?: number; resetRetryCount?: boolean } = {},
  ): { requeued: number; failed: number } {
    this.ensureOpen();

    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(
        `Cannot requeue dead letters: "${queueName}" is not a queue that has been subscribed to.`,
      );
    }

    const resetRetryCount = options.resetRetryCount ?? true;
    const batch = queue.deadLetters.splice(
      0,
      options.limit ?? queue.deadLetters.length,
    );
    const rejected: DeadEntry[] = [];
    let requeued = 0;

    for (const entry of batch) {
      if (queue.buffer.length >= queue.maxQueueSize) {
        rejected.push(entry); // buffer full: leave it in the DLQ
        continue;
      }

      this.enqueue(queue, {
        ...entry.envelope,
        retryCount: resetRetryCount ? 0 : entry.envelope.retryCount,
      });
      requeued++;
    }

    queue.deadLetters.unshift(...rejected);

    logger.info(
      `[Messaging] Requeued ${requeued} dead letter(s) onto "${queueName}" (${rejected.length} failed).`,
    );

    return { requeued, failed: rejected.length };
  }

  public getStats(): Record<string, QueueStats> {
    const stats: Record<string, QueueStats> = {};

    for (const queue of this.queues.values()) {
      stats[queue.name] = {
        active: queue.active,
        buffered: queue.buffer.length,
        maxBuffered: queue.maxQueueSize,
        isFull: queue.buffer.length >= queue.maxQueueSize,
        retrying: queue.retrying.size,
        deadLettered: queue.deadLetters.length,
      };
    }

    return stats;
  }

  /**
   * Stops accepting work, then waits for in-flight and buffered messages to
   * finish. Messages waiting on a retry backoff, and anything still unprocessed
   * when the timeout hits, are dead-lettered so `onDeadLetter` can persist them.
   */
  public close(timeoutMs: number = this.shutdownTimeoutMs): Promise<void> {
    this.closePromise ??= this.shutdown(timeoutMs);
    return this.closePromise;
  }

  private async shutdown(timeoutMs: number): Promise<void> {
    this.closed = true;

    for (const queue of this.queues.values()) {
      for (const [timer, envelope] of queue.retrying) {
        clearTimeout(timer);
        this.deadLetter(
          queue,
          envelope,
          "Broker shut down while awaiting retry.",
        );
      }
      queue.retrying.clear();
    }

    if (!this.isIdle()) {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const timedOut = await Promise.race([
        new Promise<boolean>((resolve) =>
          this.idleWaiters.push(() => resolve(false)),
        ),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(true), timeoutMs);
        }),
      ]);

      clearTimeout(timer);

      if (timedOut) {
        for (const queue of this.queues.values()) {
          if (queue.active > 0) {
            logger.warn(
              `[Messaging] Queue "${queue.name}" has ${queue.active} handler(s) still running at shutdown.`,
            );
          }

          let envelope: Envelope | undefined;
          while ((envelope = queue.buffer.shift())) {
            this.deadLetter(
              queue,
              envelope,
              "Shutdown timed out before delivery.",
            );
          }
        }
      }
    }

    logger.info("[Messaging] In-memory broker closed.");
  }

  private enqueue(queue: QueueState, envelope: Envelope): void {
    if (queue.buffer.length >= queue.maxQueueSize) {
      this.reportQueueFull(queue, envelope.event, envelope.id);
      return;
    }

    this.enqueueAccepted(queue, envelope);
  }

  private enqueueAccepted(queue: QueueState, envelope: Envelope): void {
    queue.buffer.push(envelope);
    this.schedule(queue);
  }

  private reportQueueFull(
    queue: QueueState,
    event: EventName,
    messageId: string,
  ): PublishQueueCapacity {
    const capacity: PublishQueueCapacity = {
      queue: queue.name,
      buffered: queue.buffer.length,
      maxBuffered: queue.maxQueueSize,
    };

    logger.error(
      `[Messaging] Queue "${queue.name}" is full ` +
        `(${capacity.buffered}/${capacity.maxBuffered}); ` +
        `publication "${event}" ${messageId} rejected.`,
    );

    this.safely(() =>
      this.onRejected?.({
        ...capacity,
        event,
        messageId,
        reason: "QUEUE_FULL",
      }),
    );

    return capacity;
  }

  /** Defer the pump so `publish()` returns before any handler starts. */
  private schedule(queue: QueueState): void {
    if (queue.scheduled) {
      return;
    }

    queue.scheduled = true;

    setImmediate(() => {
      queue.scheduled = false;
      this.pump(queue);
    });
  }

  private pump(queue: QueueState): void {
    while (queue.active < queue.concurrency) {
      const envelope = queue.buffer.shift();

      if (!envelope) {
        break;
      }

      queue.active++;
      void this.run(queue, envelope);
    }

    this.notifyIfIdle();
  }

  private async run(queue: QueueState, envelope: Envelope): Promise<void> {
    try {
      const handler = queue.handlers.get(envelope.event);

      if (!handler) {
        throw new Error(
          `No handler for "${envelope.event}" on queue "${queue.name}".`,
        );
      }

      await handler(envelope.payload, this.toMetadata(queue, envelope));
    } catch (error) {
      this.onFailure(queue, envelope, error);
    } finally {
      queue.active--;
      this.pump(queue);
    }
  }

  private onFailure(
    queue: QueueState,
    envelope: Envelope,
    error: unknown,
  ): void {
    const nextRetryCount = envelope.retryCount + 1;
    const { retry } = queue;

    if (retry && !this.closed && nextRetryCount <= retry.maxRetries) {
      const delay = computeBackoffMs(nextRetryCount, retry);
      const retryEnvelope: Envelope = {
        ...envelope,
        retryCount: nextRetryCount,
      };

      const timer = setTimeout(() => {
        queue.retrying.delete(timer);
        queue.buffer.push(retryEnvelope); // retries bypass maxQueueSize: never lose work we accepted
        this.schedule(queue);
      }, delay);

      timer.unref(); // a pending retry must not keep the process alive
      queue.retrying.set(timer, retryEnvelope);

      logger.warn(
        `[Messaging] "${envelope.event}" ${envelope.id} failed on "${queue.name}". ` +
          `Retry ${nextRetryCount}/${retry.maxRetries} in ${delay}ms.`,
        error,
      );
      return;
    }

    this.deadLetter(queue, envelope, describeError(error), error);
  }

  private deadLetter(
    queue: QueueState,
    envelope: Envelope,
    reason: string,
    error?: unknown,
  ): void {
    queue.deadLetters.push({ envelope, error: reason, failedAt: Date.now() });

    if (queue.deadLetters.length > this.maxDeadLetters) {
      queue.deadLetters.shift();
      logger.warn(
        `[Messaging] Dead-letter buffer for "${queue.name}" exceeded ${this.maxDeadLetters}. Evicted the oldest.`,
      );
    }

    logger.error(
      `[Messaging] "${envelope.event}" ${envelope.id} dead-lettered on "${queue.name}": ${reason}`,
      error,
    );

    this.safely(() =>
      this.onDeadLetter?.(this.getDeadLetters(queue.name as QueueName).at(-1)!),
    );
  }

  private toMetadata(queue: QueueState, envelope: Envelope): MessageMetadata {
    return {
      queue: queue.name as QueueName,
      type: envelope.event,
      messageId: envelope.id,
      headers: envelope.headers,
      timestamp: envelope.timestamp,
      retryCount: envelope.retryCount,
      redelivered: envelope.retryCount > 0,
      correlationId: envelope.correlationId,
    };
  }

  private resolveConfig(options: SubscribeOptions): QueueConfig {
    const concurrency = options.concurrency ?? this.defaultConcurrency;
    const maxQueueSize = options.maxQueueSize ?? this.defaultMaxQueueSize;

    assertPositiveInt("concurrency", concurrency);
    assertPositiveInt("maxQueueSize", maxQueueSize);

    return { concurrency, maxQueueSize, retry: resolveRetry(options.retry) };
  }

  private warnOnConfigDrift(
    queue: QueueState,
    options: SubscribeOptions,
    resolved: QueueConfig,
  ): void {
    const drifted =
      (options.concurrency !== undefined &&
        resolved.concurrency !== queue.concurrency) ||
      (options.maxQueueSize !== undefined &&
        resolved.maxQueueSize !== queue.maxQueueSize) ||
      (options.retry !== undefined &&
        JSON.stringify(resolved.retry) !== JSON.stringify(queue.retry));

    if (drifted) {
      logger.warn(
        `[Messaging] Queue "${queue.name}" was already configured. ` +
          `Options on this later subscribe() call are ignored.`,
      );
    }
  }

  private isIdle(): boolean {
    for (const queue of this.queues.values()) {
      if (queue.active > 0 || queue.buffer.length > 0) {
        return false;
      }
    }
    return true;
  }

  private notifyIfIdle(): void {
    if (this.idleWaiters.length > 0 && this.isIdle()) {
      for (const resolve of this.idleWaiters.splice(0)) {
        resolve();
      }
    }
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (error) {
      logger.error("[Messaging] A broker hook threw.", error);
    }
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("In-memory broker has already been closed.");
    }
  }
}

function computeBackoffMs(
  attempt: number,
  retry: ResolvedRetryOptions,
): number {
  const delay = retry.initialDelayMs * Math.pow(retry.factor, attempt - 1);
  return Math.min(Math.round(delay), retry.maxDelayMs);
}

function resolveRetry(retry?: RetryOptions): ResolvedRetryOptions | undefined {
  if (!retry) {
    return undefined;
  }

  const resolved: ResolvedRetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retry };

  if (resolved.maxRetries < 1) {
    throw new Error("RetryOptions.maxRetries must be at least 1.");
  }
  if (resolved.initialDelayMs < 1) {
    throw new Error("RetryOptions.initialDelayMs must be a positive number.");
  }
  if (resolved.factor < 1) {
    throw new Error("RetryOptions.factor must be at least 1.");
  }
  if (resolved.maxDelayMs < resolved.initialDelayMs) {
    throw new Error(
      "RetryOptions.maxDelayMs must be greater than or equal to initialDelayMs.",
    );
  }

  return resolved;
}

function assertPositiveInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function cloneOrThrow<T>(event: string, value: T): T {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new Error(
      `Cannot publish "${event}": payload is not cloneable (got ${typeof value}).`,
    );
  }

  try {
    return structuredClone(value);
  } catch (error) {
    throw new Error(`Cannot publish "${event}": payload is not cloneable.`, {
      cause: error,
    });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
