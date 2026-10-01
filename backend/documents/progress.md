# Progress

## DevOps & runtime

- Switched Nest compile from `tsc` to SWC. A full compile dropped from about 30s to under 1s. `tsc` was typechecking the generated Prisma client on every start.
- Added `npm run typecheck` for a full TypeScript check. `nest build` / `start:dev` no longer wait on it.
- Installed missing `@nestjs/bullmq` and `bullmq`.
- Added `.env` from `.env.example`. Database URL now matches docker-compose (`postgres` / `postgres`).
- Production entry is `dist/main.js` in `package.json`, the Dockerfile, and docker-compose.
- Postgres pool fails a connection attempt after 5 seconds instead of waiting with no timeout.
- In development, BullMQ does not keep reconnecting when Redis is down, so the process can finish booting and the log stays readable.
- Verified `GET /health/live` returns 200 without Postgres or Redis. Unit tests pass.

## Real AI (OpenAI)

- **`OpenAiAiClient`** implements `AiClient`: streaming chat (RAG prompt), OpenAI embeddings (batched), conversation/knowledge summaries, PDF/DOCX/TXT extraction (`pdf-parse`, `mammoth`).
- **`StubAiClient`** remains for zero-cost local dev when no API key is set.
- **`AI_PROVIDER`**: `auto` (default) uses OpenAI when `OPENAI_API_KEY` is set; `stub` / `openai` force a backend.
- Config: `.env.example`, Joi validation, `configuration.ts`, Docker Compose env for API + worker.
- Chat records real token usage via `OpenAiAiClient.readChatUsage()` → `LlmUsageEvent`.
- **`POST /documents/:id/reprocess`** re-queues extract/chunk/embed after switching from stub to OpenAI.
- Details: `docs/ai-integration.md`.
- Frontend **Integrations** page (`/w/:id/connectors`): catalog UI for Drive, OneDrive/SharePoint, etc., wired to `connectorsApi`.

## Enable real answers locally

1. Set `OPENAI_API_KEY` in `backend/.env`.
2. Restart API and worker (both call `AI_CLIENT`).
3. Reprocess or re-upload documents so vectors are real embeddings (not stub hashes).
4. Chat in a workspace with indexed docs.

## Connectors, rerank, eval

- **Connectors**: `DelegatingConnectorDriver` + live drivers for all 8 PRD types (GitHub, PostgreSQL, Notion, Slack, Jira, Confluence, Google Drive, SharePoint). Missing credentials → demo stub. See `docs/connectors.md`.
- **Reranking**: OpenAI JSON relevance scores on top-K chunks (lexical fallback); stub provider uses lexical rerank.
- **Eval**: `AiClient.judgeRetrievalContext` — OpenAI LLM-as-judge for answer relevance & faithfulness; heuristic when stub.
