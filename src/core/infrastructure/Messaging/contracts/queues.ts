export const QUEUES = {
  DEFAULT: "default.queue",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
