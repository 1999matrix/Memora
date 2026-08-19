import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

import { RedisService } from './redis.service';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const redisKey = `throttle:${throttlerName}:${key}`;
      const totalHits = await this.redis.incr(redisKey);

      if (totalHits === 1) {
        await this.redis.pexpire(redisKey, ttl);
      }

      const timeToExpireMs = await this.redis.pttl(redisKey);
      const isBlocked = totalHits > limit;

      if (isBlocked && blockDuration > 0) {
        const blockKey = `${redisKey}:block`;
        await this.redis.set(blockKey, '1', Math.ceil(blockDuration / 1000));
      }

      return {
        totalHits,
        timeToExpire: Math.max(Math.ceil(timeToExpireMs / 1000), 0),
        isBlocked,
        timeToBlockExpire: isBlocked
          ? Math.max(Math.ceil(blockDuration / 1000), 0)
          : 0,
      };
    } catch {
      // ponytail: degrade to allow-all when Redis is down; restore strict limiting once Redis is required in prod
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
