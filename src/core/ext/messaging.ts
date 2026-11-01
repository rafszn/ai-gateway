import logger from "../../config.js";
import { initiateInMemoryMessaging } from "../infrastructure/Messaging/inMemory/in-memory-initiation.js";

export const initializeMessaging = () => {
  initiateInMemoryMessaging({
    defaultConcurrency: 5,
    onDeadLetter: (dl) => logger.error("Message dead-lettered", dl),
    onDropped: (d) => logger.error("Message dropped (queue full)", d),
  });
};
