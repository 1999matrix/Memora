# AI / LLM integration (Memora backend)

## How it works today

All RAG and chat flows go through a single NestJS abstraction:

| Interface | File | Used by |
|-----------|------|---------|
| `AiClient` | `src/ai/ai-client.interface.ts` | Chat, retrieval, document worker, summaries |

The app injects `AI_CLIENT` (symbol). **Implementations:**

- **`StubAiClient`** — deterministic fake embeddings + stub answers (no API key).
- **`OpenAiAiClient`** — real OpenAI chat, embeddings, summarization; PDF/DOCX extraction via `pdf-parse` / `mammoth`.

Switch with env:

```env
AI_PROVIDER=auto    # default — OpenAI when OPENAI_API_KEY is set, else stub
AI_PROVIDER=stub    # force fake embeddings / answers (no API cost)
AI_PROVIDER=openai  # force OpenAI (key required at boot)
OPENAI_API_KEY=sk-...
```

Optional model overrides (defaults match `text-embedding-3-small` @ 1536 dims):

```env
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_SUMMARY_MODEL=gpt-4o-mini
EMBEDDING_DIMENSIONS=1536
```

Restart API **and** BullMQ worker after changing `AI_PROVIDER` — both processes embed documents and run summaries.

## Enable real OpenAI (step by step)

1. Copy `.env.example` → `.env` if needed.
2. Set `OPENAI_API_KEY` (with `AI_PROVIDER=auto`, OpenAI is selected automatically).
3. Start Postgres, Redis, backend, worker (`npm run start:dev` + worker process or Docker Compose).
4. **Re-process documents** (critical): stub embeddings are hash-based pseudo-vectors. Vector search only works after re-ingest with OpenAI embeddings.
   - `POST /documents/:id/reprocess`, or re-upload files.
5. Chat via SSE — answers should cite retrieved chunks; usage is logged to `LlmUsageEvent` with real token counts when OpenAI is active.

## What each `AiClient` method does

| Method | Stub | OpenAI |
|--------|------|--------|
| `extractText` | Plain text only; fake body for PDF | PDF, DOCX, TXT, MD |
| `chunkText` | Fixed 800-char windows | Same (not LLM-based yet) |
| `embed` | SHA256 pseudo-vectors | `embeddings.create` |
| `rerank` | Lexical term boost | LLM relevance scores (lexical fallback) |
| `chatStream` | Fake streamed answer | Streaming `chat.completions` + RAG prompt |
| `summarizeConversation` | String concat | LLM rolling summary |
| `summarizeKnowledge` | Truncated text | LLM summary |

## PRD FastAPI sidecar (future)

The PRD shows `NestJS → FastAPI AI → OpenAI`. You can keep **`AiClient` unchanged** and add `HttpAiClient` that calls FastAPI endpoints if you move extraction or models to Python later. Docker Compose still has an `ai-service` placeholder.

Suggested FastAPI routes (when you build it):

```text
POST /v1/extract
POST /v1/embed
POST /v1/chat/stream   (SSE)
POST /v1/summarize
```

Nest would set `AI_PROVIDER=http` and point `AI_SERVICE_URL` at the sidecar.

## Related (outside raw `AiClient` methods)

- **Connectors** — live API drivers per type; demo stub without credentials (`docs/connectors.md`).
- **Eval** — `evaluation.service.ts` calls `judgeRetrievalContext` on `AI_CLIENT`.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| App fails on boot with OpenAI key error | `AI_PROVIDER=openai` but missing `OPENAI_API_KEY` |
| Chat works but retrieval is nonsense | Documents still have stub embeddings — re-process |
| `vector dimension mismatch` | `EMBEDDING_DIMENSIONS` ≠ model output (keep 1536 for `text-embedding-3-small`) |
| PDF empty text | Scanned PDF — needs OCR (out of scope for current extractors) |

## Tests

```bash
npm test -- stub-ai.client.spec
npm run build
```

Integration tests against OpenAI are intentionally not in CI (cost + secret). Validate manually with a small workspace upload + one chat turn.
