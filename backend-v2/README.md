# Memora backend-v2

Express + Prisma API (no Nest). Same HTTP surface as `backend/`. Optional Python AI sidecar.

## Quick start (local)

1. Copy `.env.example` to `.env` in `backend-v2/`.
2. Infra: `docker compose up -d postgres redis` from this folder.
3. API + worker (one command from `backend-v2/`):

```bash
cd api && npm install && npm run prisma:generate && npm run prisma:migrate
cd .. && npm install && npm run dev
```

Or two terminals: `api/npm run dev` and `api/npm run dev:worker`.

4. Frontend (`../frontend`): `npm install && npm run dev` — proxies to port 7000.

5. Optional AI service:

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Default API port: **7000** (`PORT` in env). Swagger UI: `http://localhost:7000/docs`. Frontend: `VITE_API_BASE_URL=http://localhost:7000`.

Redis: local Docker or [Upstash](https://console.upstash.com/) — set `REDIS_URL` to the **TCP** `rediss://…` URL. See [docs/REDIS.md](docs/REDIS.md).

Point Node at Python sidecar:

```env
AI_SERVICE_URL=http://localhost:8001
```

Node uses `HttpAiClient` instead of in-process OpenAI/stub when this is set.

## vs Nest `backend/`

| Layer | v1 Nest | v2 |
|-------|---------|-----|
| HTTP | Controllers + guards | Express routes + middleware |
| Domain | Services in `src/modules` | Same logic under `api/src/domain` (ported) |
| DI | Nest modules | `createContainer()` manual wiring |
| Workers | Nest BullMQ processors | `worker.ts` BullMQ `Worker` |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for RAG and connector design.
