# AI Integration Hints (Phases 2–4)

You currently run on **`StubAiClient`**. Swap methods one by one — Nest wiring stays the same.

## File to edit

`backend/src/ai/stub-ai.client.ts` → later add `http-ai.client.ts` that calls FastAPI, then change `AiModule` provider.

## 1. Text extraction (`extractText`)

- **Goal:** PDF/DOCX → plain text (+ optional page map)
- **Hint:** FastAPI + PyMuPDF (`fitz`) for PDF; `python-docx` for DOCX
- **Return:** full text string (page markers like `\n\n[[page=3]]\n` help citations)

## 2. Chunking (`chunkText`)

- **Goal:** Split long text into ~500–1000 token windows with overlap
- **Hint:** start with recursive character splitter; later semantic chunking
- **Keep:** `chunkIndex`, `pageNumber`, short `metadata`

## 3. Embeddings (`embed`)

- **Goal:** `string[]` → `number[][]` length **1536** (or change DB vector size + constant together)
- **Hint:** OpenAI `text-embedding-3-small` (dim 1536) or sentence-transformers with matching dim
- **Must:** same model for documents and queries

## 4. Reranking (`rerank`)

- **Goal:** Re-order retrieved chunks by relevance to the question
- **Hint:** cross-encoder (`ms-marco-MiniLM`) or Cohere/OpenAI rerank API
- **Stub today:** identity pass-through

## 5. Chat streaming (`chatStream`)

- **Goal:** `AsyncGenerator<string>` of answer tokens; cite sources from `contexts`
- **Hint:** OpenAI Responses/Chat Completions with `stream: true`; prompt = system + **conversationSummary** + recent history + contexts + question
- **Citations:** Nest already sends structured `citations` in SSE `meta` event — keep document/chunk ids stable

## 6. Conversation summarization (`summarizeConversation`) — Phase 6

- **Goal:** Compress older turns into a rolling summary so the model never sees the full thread
- **Hint:** Call an LLM with `previousSummary` + messages older than the recent window; return 1–2 paragraphs
- **Wiring:** BullMQ `summary-generation` job; Nest keeps last `RECENT_MESSAGE_LIMIT` messages verbatim

## 7. Knowledge summarization (`summarizeKnowledge`) — Phase 7

- **Goal:** Document / workspace / connector summaries stored in `KnowledgeSummary` (+ embedding)
- **Hint:** Same summarizer LLM; input is extracted text or child summaries
- **Retrieval:** summaries are vector-searched and fused with chunk hits (`metadata.isSummary`)

## Suggested learning order

1. TXT/MD already works via stub file read — upload a `.txt` end-to-end first  
2. Real embeddings (biggest quality jump for retrieval)  
3. Real PDF extraction  
4. Real chat stream  
5. Rerank last

## Smoke test path

1. Register/login → create org/workspace  
2. `POST /api/workspaces/:id/documents` with a `.txt` file  
3. Wait until document `status=READY`  
4. `POST /api/workspaces/:id/retrieval/search` `{ "query": "..." }`  
5. `POST /api/workspaces/:id/chat` SSE body `{ "message": "..." }`
