import type Redis from 'ioredis';

export class RedisService {
  constructor(private readonly client: Redis) {}

  getClient(): Redis {
    return this.client;
  }

  async connect(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }

  async ping(): Promise<string> {
    await this.connect();
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    await this.connect();
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.connect();
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.connect();
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    await this.connect();
    return this.client.incr(key);
  }

  async pexpire(key: string, ttlMs: number): Promise<void> {
    await this.connect();
    await this.client.pexpire(key, ttlMs);
  }

  async pttl(key: string): Promise<number> {
    await this.connect();
    return this.client.pttl(key);
  }
}
