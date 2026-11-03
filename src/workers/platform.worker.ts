import logger from "../config.js";
import { inject, injectable } from "tsyringe";
import { MessagingTokens } from "../core/infrastructure/Messaging/tokens.js";
import { QUEUES } from "../core/infrastructure/Messaging/contracts/queues.js";
import { IConsumer } from "../core/infrastructure/Messaging/inMemory/types.js";

@injectable()
export class PlatformWorker {
  constructor(
    @inject(MessagingTokens.Consumer)
    private readonly consumer: IConsumer,
  ) {}

  async start(): Promise<void> {
    /** workers */
    await this.consumer.subscribe(
      QUEUES.DEFAULT,
      "default.event",
      async (p, m) => {
        logger.info("Consumed", { payload: p, metadata: m });
      },
      {
        concurrency: 5,
        retry: {
          factor: 2,
          maxRetries: 3,
          maxDelayMs: 30_000,
          initialDelayMs: 1_000,
        },
      },
    );
  }

  async stop(): Promise<void> {
    await this.consumer.close();
  }
}
