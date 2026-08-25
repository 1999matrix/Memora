# Production hardening notes (Phase 12)

## Implemented in code
- Correlation IDs (`x-correlation-id`) via middleware + pino custom props
- Structured logging (nestjs-pino) with secret redaction
- Helmet secure headers, CORS, compression
- Redis-backed rate limiting
- Graceful shutdown hooks (`enableShutdownHooks`)
- Health live/ready (Postgres + Redis)
- BullMQ retries + exponential backoff on document/connector/summary jobs
- AuditLog + LlmUsageEvent persistence

## Ops checklist (outside app code)
- Manage secrets via env/Secret Manager (never commit real JWT/DB secrets)
- Postgres backups: scheduled `pg_dump` or managed provider snapshots
- Connection pooling: rely on Prisma + pg adapter; tune `connection_limit` in DATABASE_URL if needed
- Circuit breakers: add when real FastAPI/OpenAI clients replace stubs (e.g. opossum)
