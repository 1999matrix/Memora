# Phase 1 Backend Foundation — Design

**Date:** 2026-08-14  
**Scope:** Phase 1 only (auth, tenancy, infra). No RAG/AI/chat/connectors.  
**Stack exceptions:** Keep Prisma 7 + driver adapter (document deviation from PRD Prisma 6).

## Approach

Vertical slices: shared foundation → Auth → Users → Organizations (+ members) → Workspaces (+ members) → Redis/rate-limit/logging/health/Docker/tests.

## Architecture

Modular NestJS monolith under `src/modules/*`. Controllers → Services → Prisma/Redis. Global JWT guard (`@Public` opt-out), RolesGuard, ValidationPipe, exception filter, response interceptor. API prefix `api`; health probes excluded.

## Auth & users

- Endpoints: register, login, refresh, logout, `/auth/me`
- Dual JWT secrets; payload `{ sub, email, role }` only
- bcrypt (12) passwords; SHA-256 hashed refresh tokens with rotation
- Users: `GET/PATCH /users/me`, `GET /users/:id` (self or SUPER_ADMIN)

## Orgs & workspaces

- Org CRUD + nested members; create adds OWNER
- Workspace CRUD + nested members; create adds ADMIN; requires org OWNER/ADMIN to create
- Membership checked from DB every request; never trust client IDs for authorization

## Infra

- Redis module (ioredis) for rate limiting + future queues
- nestjs-pino logging with secret redaction
- Health: live (process), ready (Postgres + Redis)
- Docker Compose: postgres 17, redis 8, backend
- Tests: auth flows, org/workspace roles, mandatory cross-tenant isolation

## AI boundary

Embedding, retrieval, chat generation, and FastAPI integration are out of Phase 1; deferred to learner-owned AI tasks with hints later.
