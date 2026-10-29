import type { NextFunction, Request, Response } from 'express';

import type { RedisService } from '../domain/redis/redis.service.js';
import { TooManyRequestsException } from './http-errors.js';

type LimitOptions = {
  windowMs: number;
  limit: number;
  prefix: string;
};

async function consume(
  redis: RedisService,
  key: string,
  opts: LimitOptions,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const redisKey = `ratelimit:${opts.prefix}:${key}`;
  const hits = await redis.incr(redisKey);
  if (hits === 1) {
    await redis.pexpire(redisKey, opts.windowMs);
  }
  const ttlMs = await redis.pttl(redisKey);
  const retryAfterSec = ttlMs > 0 ? Math.ceil(ttlMs / 1000) : Math.ceil(opts.windowMs / 1000);
  return { allowed: hits <= opts.limit, retryAfterSec };
}

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function redisRateLimit(redis: RedisService, opts: LimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { allowed, retryAfterSec } = await consume(redis, clientKey(req), opts);
      if (!allowed) {
        res.setHeader('Retry-After', String(retryAfterSec));
        next(new TooManyRequestsException('Too many requests'));
        return;
      }
      next();
    } catch {
      next();
    }
  };
}
