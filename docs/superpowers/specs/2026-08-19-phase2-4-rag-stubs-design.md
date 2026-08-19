# Phase 2–4 RAG Foundation (Stubs) — Design

**Date:** 2026-08-19  
**AI policy:** `AiClient` + `StubAiClient` only. Real models later (learner-owned).  
**Storage:** `FileStorage` + `LocalFileStorage` now; S3-compatible later.

## Flow

Upload → validate → local store → BullMQ `document-processing` → stub extract/chunk/embed → chunks + pgvector → hybrid retrieval → chat SSE with citation shape.

## Modules

- `ai` — interface + stub  
- `storage` — local files under `storage/`  
- `queues` — BullMQ document processor  
- `documents` — upload/list/get/delete  
- `retrieval` — vector + FTS + RRF hybrid (+ stub rerank)  
- `chat` — conversations + SSE chat

## Out of scope

Real OpenAI/FastAPI, connectors, production S3, Kubernetes.
