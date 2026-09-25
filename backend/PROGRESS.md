# Progress — real AI integration

- Added `OpenAiAiClient` implementing `AiClient` (chat stream, embeddings, summaries, PDF/DOCX extract).
- `AI_PROVIDER=stub|openai` switches implementation in `AiModule`.
- Extended config / `.env.example` / Joi validation for OpenAI env vars.
- Chat usage tracking reads real token counts from OpenAI when active.
- Documented setup and re-embed requirement in `docs/ai-integration.md`.
- Dependencies: `openai`, `pdf-parse`, `mammoth`.
