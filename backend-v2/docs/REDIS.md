# Redis in Memora (local vs Upstash)

## Why Redis exists in this project

| Use | Required? | What breaks without it |
|-----|-----------|-------------------------|
| **BullMQ job queues** (document ingest, connector sync, summaries) | **Yes** for real product | Uploads stay `PENDING`; sync and summaries never run |
| **Health / admin** | Soft | `/health/ready` fails; dashboard shows Redis down |
| **API rate limits** | No for solo dev | Limits fall back to fail-open if Redis is down; with Redis, limits are shared across instances |

Postgres holds durable data. Redis holds **short-lived queue state** and **rate-limit counters**. It is not your source of truth.

## Is Redis actually needed?

- **Local dev:** `docker compose up redis` or Upstash free DB — pick one.
- **Serverless API only, no worker:** You still need Redis **somewhere** if the worker runs (even on another machine). Queues are Redis-backed.
- **Could you drop Redis?** Only if you replace BullMQ with DB-polling or inline processing (worse UX, timeouts on upload). Not recommended for Memora’s design.

## Upstash (production / free tier)

1. Create a Redis database in [Upstash Console](https://console.upstash.com/) (or `redis_create_database` via Upstash MCP).
2. Copy the **Redis URL** (`rediss://default:…@….upstash.io:6379`) — **not** the REST URL — into `backend-v2/.env`:

```env
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379
```

3. Optional (REST, for tools / `@upstash/redis` elsewhere):

```env
UPSTASH_REDIS_REST_URL=https://….upstash.io
UPSTASH_REDIS_REST_TOKEN=…
```

The API uses **ioredis over TCP** (`REDIS_URL`) for BullMQ and app Redis. REST vars are documented for MCP and future edge clients; queues still need `REDIS_URL`.

4. Run API + **worker** against the same `REDIS_URL` (local worker or second container).

## Local (docker-compose)

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# leave REDIS_URL unset
```

## Verify

```bash
curl http://localhost:7000/health/ready
```

Expect `checks.redis: "up"`.
