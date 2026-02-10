type MessageHandler = (raw: string) => void;

type RedisLike = {
  pub: {
    connect: () => Promise<void>;
    quit: () => Promise<void>;
    publish: (channel: string, payload: string) => Promise<number>;
  };
  sub: {
    connect: () => Promise<void>;
    quit: () => Promise<void>;
    subscribe: (channel: string, handler: MessageHandler) => Promise<void>;
  };
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

function makeInMemoryRedis(): RedisLike {
  const handlers = new Map<string, Set<MessageHandler>>();

  return {
    pub: {
      async connect() {},
      async quit() {},
      async publish(channel: string, payload: string) {
        const set = handlers.get(channel);
        if (!set) return 0;
        for (const handler of set) handler(payload);
        return set.size;
      }
    },
    sub: {
      async connect() {},
      async quit() {},
      async subscribe(channel: string, handler: MessageHandler) {
        if (!handlers.has(channel)) handlers.set(channel, new Set<MessageHandler>());
        handlers.get(channel)!.add(handler);
      }
    },
    async start() {},
    async stop() {}
  };
}

export async function makeRedis(url: string): Promise<RedisLike> {
  try {
    const redis = await import("redis");
    const pub = redis.createClient({ url });
    const sub = redis.createClient({ url });

    return {
      pub,
      sub,
      async start() {
        await pub.connect();
        await sub.connect();
      },
      async stop() {
        await pub.quit();
        await sub.quit();
      }
    };
  } catch {
    console.warn("[core] Optional dependency 'redis' is not installed; using in-memory pub/sub fallback.");
    return makeInMemoryRedis();
  }
}
