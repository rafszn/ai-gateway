export interface EventMap {
  "default.event": {
    userId: string;
    email: string;
    name: string;
  };
}

export type EventName = keyof EventMap;
