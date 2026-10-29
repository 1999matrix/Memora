# Memora backend-v2 architecture

## Goals

- **Express** for HTTP: familiar routing, thin controllers, same `/api/v1` contract as Nest `backend`.
- **Python FastAPI** for heavy AI I/O: PDF/DOCX extract, batch embed, streaming chat (optional sidecar).
- **Postgres + pgvector** for vectors and app data (shared schema with v1).
- **Redis + BullMQ** for async ingest, connector sync, summaries.

## Layout

Industry pattern (Express + Python sidecar): Node owns auth, CRUD, queues, and DB; Python owns extract/embed/chat I/O in a **separate process** with its own restart cycle. Same repo, two deployable units.

```
backend-v2/
  api/           Node 20+, Express, Prisma, BullMQ worker
  ai-service/    Python FastAPI (optional; Node still has OpenAI/stub clients)
  docker-compose.yml
```

## RAG pipeline (industry pattern)

1. **Ingest** — upload or connector sync writes files to object storage, `Document` row `PENDING`.
2. **Extract** — text from PDF/DOCX/txt (Node `OpenAiAiClient` or Python `/v1/extract`).
3. **Chunk** — fixed windows with overlap (~800 chars); store `DocumentChunk`.
4. **Embed** — same model for docs and queries; `vector(1536)` in Postgres.
5. **Index** — pgvector cosine + optional BM25 (`to_tsvector`) hybrid in `RetrievalService`.
6. **Retrieve** — top-K chunks + knowledge summaries, optional rerank.
7. **Generate** — SSE chat with context + rolling `ConversationSummary`.
8. **Evaluate** — super-admin eval runs (faithfulness / relevance judges).

Async steps run on **BullMQ** queues: `document-processing`, `connector-sync`, `summary-generation`.

## Connectors (Google Drive, OneDrive / SharePoint, etc.)

Use a **driver registry** (`ConnectorRegistry` + `DelegatingConnectorDriver`):

| Type | Auth | Sync model |
|------|------|------------|
| `GOOGLE_DRIVE` | OAuth 2.0 (Google Cloud project, refresh token in connector `config` JSON) | Drive Changes API or periodic folder listing → download → same ingest queue |
| `SHAREPOINT` / OneDrive | Microsoft Entra ID OAuth + Graph API (`/me/drive/root/children`) | Delta query for changes → download → ingest |
| `GITHUB` | PAT or GitHub App | List repo files / releases |
| `NOTION`, `SLACK`, … | Provider OAuth | List resources → export text |

**Production checklist**

1. Store OAuth **refresh tokens encrypted** (KMS or app-level secret), never log `config`.
2. **Incremental sync** — cursor per connector (`nextCursor` on sync items); dedupe by content hash.
3. **Rate limits** — backoff in worker; one sync job per connector at a time.
4. **Scope** — least privilege (Drive `drive.readonly`, Graph `Files.Read`).
5. **Webhook optional** — Drive push notifications / Graph subscriptions to reduce polling cost.

Memora v2 reuses v1 connector types and stub/live drivers; wire real OAuth in `drivers/` per provider.

## API compatibility

- Prefix: `api/v1` (health at `/health`, `/health/live`, `/health/ready`).
- JSON envelope: `{ success: true, data }` except SSE chat and health.
- Auth: Bearer JWT (same env secrets as v1).

## Next integration step

Point Node ingest at Python when `AI_SERVICE_URL` is set (HTTP client implementing `AiClient`). Until then, Node `stub` / `openai` providers behave like v1.
