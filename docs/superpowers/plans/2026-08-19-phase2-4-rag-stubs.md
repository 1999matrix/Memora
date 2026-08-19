# Phase 2–4 RAG Stubs Implementation Plan

> **For agentic workers:** Implement task-by-task. AI = stubs only.

**Goal:** Runnable Nest RAG pipeline (ingest → retrieve → chat SSE) with stub AI and local file storage.

**Architecture:** Modular Nest + BullMQ + pgvector; `AiClient` / `FileStorage` abstractions.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL+pgvector, Redis, BullMQ, multer

## Global Constraints

- No real LLM/embedding provider code
- Tenant isolation via workspace membership
- Embedding dims: 1536 (config)

## Tasks

- [ ] Schema + migration (documents, chunks, conversations, vector extension)
- [ ] storage + ai modules (local + stub)
- [ ] queues (document-processing worker)
- [ ] documents module (upload APIs)
- [ ] retrieval module (hybrid search)
- [ ] chat module (SSE + citations shape)
- [ ] wire AppModule/config; AI hints doc; build/tests
