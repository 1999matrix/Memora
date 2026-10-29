import Redis from 'ioredis';

import type { AppConfigService } from './config.js';

/** Shared ioredis options for BullMQ (needs maxRetriesPerRequest: null). */
export function createRedisClient(config: AppConfigService): Redis {
  const url = config.get<string>('redis.url')?.trim();
  if (url) {
    return new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return new Redis({
    host: config.getOrThrow<string>('redis.host'),
    port: config.get<number>('redis.port') ?? 6379,
    password: config.get<string>('redis.password') || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}
