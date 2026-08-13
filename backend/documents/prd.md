# Enterprise AI Knowledge Assistant

## Product Requirements Document (PRD)

**Document Version:** 1.0
**Status:** Implementation Specification
**Project Type:** Enterprise AI / RAG / Knowledge Management Platform

---

# 1. Product Overview

Build a production-oriented **Enterprise AI Knowledge Assistant** that allows organizations to connect their internal knowledge sources and ask natural-language questions over that information.

The system will ingest data from enterprise sources, normalize and chunk the content, generate embeddings, store searchable knowledge, retrieve relevant information, and generate AI responses with source citations.

The product must be designed as a **multi-tenant SaaS platform**.

Primary hierarchy:

```text
Platform
  │
  └── Organization
        │
        ├── Members
        │
        └── Workspaces
              │
              ├── Documents
              ├── Connectors
              ├── Conversations
              ├── Messages
              ├── Embeddings
              ├── Feedback
              └── Analytics
```

The initial implementation should use a **modular monolith architecture** for the NestJS backend, with clear module boundaries so that high-load components can later be extracted into independent services.

Do NOT prematurely split the application into microservices.

---

# 2. Primary Goals

The platform must eventually support:

1. Enterprise authentication
2. Multi-tenancy
3. Organization management
4. Workspace management
5. Role-based access control
6. Enterprise data connectors
7. Incremental indexing
8. Document processing
9. Chunking
10. Embeddings
11. Vector search
12. BM25/full-text search
13. Hybrid retrieval
14. Metadata filtering
15. Retrieval reranking
16. AI-generated answers
17. Streaming responses
18. Source citations
19. Multi-turn conversation memory
20. AI-generated summaries
21. User feedback
22. Admin dashboard
23. Token usage analytics
24. Cost analytics
25. Connector health monitoring
26. Auditability
27. Production observability

---

# 3. Non-Goals for Initial Implementation

Do NOT implement the following until their designated phase:

* Kubernetes
* Complex microservice decomposition
* Fine-tuning LLMs
* Custom foundation models
* Custom vector database
* Complex knowledge graph infrastructure
* Billing/payment system
* SAML/SCIM
* Advanced agentic workflows
* Mobile applications

The architecture should allow these to be added later.

---

# 4. Fixed Technology Stack

Do not arbitrarily change the technology stack.

## Backend

| Technology      | Target Version                    |
| --------------- | --------------------------------- |
| Node.js         | 22 LTS                            |
| NestJS          | 11.x                              |
| TypeScript      | 5.8+                              |
| Prisma          | 6.x                               |
| PostgreSQL      | 17                                |
| Redis           | 8.x                               |
| BullMQ          | 5.x                               |
| Pino            | 9.x                               |
| Joi             | 17.x                              |
| Jest            | compatible with NestJS 11         |
| Swagger/OpenAPI | NestJS-compatible current version |

## Frontend

| Technology     | Target         |
| -------------- | -------------- |
| React          | 19.x           |
| Vite           | current stable |
| TypeScript     | 5.8+           |
| Mantine        | 8.x            |
| TanStack Query | 5.x            |
| React Router   | 7.x            |
| Axios          | current stable |

## AI Service

| Technology            | Target         |
| --------------------- | -------------- |
| Python                | 3.13           |
| FastAPI               | current stable |
| Pydantic              | 2.x            |
| OpenAI SDK            | current stable |
| sentence-transformers | current stable |
| PyMuPDF               | current stable |

## Infrastructure

* Docker
* Docker Compose
* PostgreSQL
* Redis
* Nginx where appropriate

---

# 5. Version Policy

Before modifying dependencies:

1. Inspect `package.json`.
2. Inspect `package-lock.json`.
3. Inspect the currently installed versions.
4. Verify compatibility with Node.js 22 and NestJS 11.
5. Do not upgrade dependencies merely for the sake of upgrading.
6. If the project already contains a compatible version, preserve it.
7. Never introduce a major-version upgrade without documenting why.

The implementation must work with:

```text
Node.js 22 LTS
NestJS 11
Prisma 6
PostgreSQL 17
```

---

# 6. Existing Backend Structure

The current backend already contains:

```text
backend/
├── prisma/
├── src/
│   ├── auth/
│   ├── common/
│   ├── config/
│   ├── database/
│   ├── filters/
│   ├── guards/
│   ├── health/
│   ├── interceptors/
│   ├── middlewares/
│   ├── organizations/
│   ├── users/
│   └── workspaces/
└── test/
```

Refactor this into a feature-first structure without destroying working functionality.

Target structure:

```text
backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
│
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── organizations/
│   │   ├── workspaces/
│   │   ├── health/
│   │   ├── connectors/
│   │   ├── documents/
│   │   ├── retrieval/
│   │   ├── chat/
│   │   ├── feedback/
│   │   ├── analytics/
│   │   └── admin/
│   │
│   ├── common/
│   │   ├── constants/
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── enums/
│   │   ├── interfaces/
│   │   ├── logger/
│   │   └── utils/
│   │
│   ├── config/
│   ├── prisma/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── middlewares/
│
├── test/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

Preserve existing functionality while moving files.

---

# 7. Architecture

Use a modular monolith initially.

```text
                    React
                      │
                REST / SSE
                      │
                      ▼
              NestJS Backend
                      │
        ┌─────────────┼──────────────┐
        │             │              │
      Auth          Chat         Connectors
        │             │              │
        │        Retrieval           │
        │             │              │
        └─────────────┼──────────────┘
                      │
                 Prisma ORM
                      │
                      ▼
                 PostgreSQL
                      │
                  pgvector
                      │
                      │
                    Redis
                      │
                   BullMQ
                      │
             Background Workers
                      │
                      ▼
                FastAPI AI
                      │
                      ▼
              OpenAI / Claude
```

---

# 8. Architectural Principles

Follow these principles throughout the implementation:

### 8.1 Modular architecture

Each business capability belongs to its own module.

### 8.2 Dependency direction

Prefer:

```text
Controller
    ↓
Service
    ↓
Prisma / Repository
```

Do not allow controllers to directly access Prisma.

### 8.3 DTO validation

Every external request must use DTO validation.

Enable:

```typescript
new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
})
```

### 8.4 No `any`

Do not introduce `any` unless there is a documented unavoidable third-party typing issue.

### 8.5 Configuration

Never hardcode:

* passwords
* JWT secrets
* API keys
* database URLs
* Redis credentials
* model names
* environment-specific URLs

Use environment variables.

### 8.6 Security

Security must be considered during implementation, not added at the end.

---

# 9. Phase 1 - Backend Foundation

## Phase 1.1 - Project Bootstrap

Implement:

* NestJS configuration
* Environment validation
* Global validation
* Swagger
* Helmet
* CORS
* Compression
* Application metadata

Environment variables:

```env
PORT=3000
NODE_ENV=development
APP_NAME=Enterprise AI Assistant
APP_VERSION=1.0.0
DATABASE_URL=
REDIS_HOST=
REDIS_PORT=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
OPENAI_API_KEY=
```

---

# 10. Phase 1.2 - Database

Use:

```text
PostgreSQL 17
Prisma 6
```

Initial models:

```text
User
Organization
OrganizationMember
Workspace
WorkspaceMember
```

User fields should include:

```text
id
email
passwordHash
firstName
lastName
role
isActive
emailVerified
refreshTokenHash
lastLoginAt
createdAt
updatedAt
```

Platform role:

```text
SUPER_ADMIN
USER
```

Organization roles:

```text
OWNER
ADMIN
MEMBER
```

Workspace roles:

```text
ADMIN
MEMBER
```

Use:

```prisma
id String @id @default(cuid())
```

unless an external integration requires UUID.

---

# 11. Multi-Tenant Data Model

The tenancy hierarchy is:

```text
Organization
     │
     ├── OrganizationMember
     │
     └── Workspace
             │
             └── WorkspaceMember
```

Future knowledge data should be associated with:

```text
organizationId
workspaceId
```

Whenever appropriate.

Never allow a user to access another organization's resources.

---

# 12. Phase 1.3 - Common Infrastructure

Implement:

### Constants

* pagination
* password rules
* JWT configuration
* system limits

### Decorators

```text
@Public()
@CurrentUser()
@Roles()
@CurrentOrganization()
@CurrentWorkspace()
```

### DTOs

Pagination:

```text
page
limit
```

Maximum limit:

```text
100
```

### Interfaces

JWT payload:

```typescript
interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}
```

### Utilities

Implement:

* password hashing
* slug generation
* safe object utilities
* pagination helpers

---

# 13. Global API Response

Successful API responses should follow:

```json
{
  "success": true,
  "data": {}
}
```

Errors:

```json
{
  "success": false,
  "statusCode": 400,
  "path": "/api/example",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "message": "Validation failed"
}
```

Do not expose stack traces or internal database errors in production responses.

---

# 14. Phase 1.4 - Authentication

Implement:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

Authentication architecture:

```text
AuthController
      ↓
AuthService
      ↓
UsersService
      ↓
PrismaService
```

Do not put all user logic inside AuthService.

---

# 15. Password Security

Use bcrypt.

Minimum password length:

```text
8
```

Preferred salt rounds:

```text
12
```

Never return:

```text
passwordHash
refreshTokenHash
```

from APIs.

---

# 16. JWT

Use two secrets:

```text
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
```

Access token:

```text
15 minutes
```

Refresh token:

```text
7 days
```

JWT payload:

```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "USER"
}
```

Do not put organization or workspace IDs in the JWT.

Users may switch workspaces without requiring a new access token.

---

# 17. Refresh Token Security

Never store raw refresh tokens.

Store:

```text
hash(refreshToken)
```

in the database.

Refresh flow:

```text
Client
  │
  ▼
Refresh Token
  │
  ▼
Hash token
  │
  ▼
Compare DB hash
  │
  ▼
Generate new access token
```

Implement refresh-token rotation if practical.

Logout must invalidate the stored refresh token.

---

# 18. JWT Guard

Create a global JWT authentication guard.

Public endpoints use:

```typescript
@Public()
```

Protected endpoints require authentication by default.

Do not make every route manually add `@UseGuards(JwtAuthGuard)`.

Use a global guard and explicit public routes.

---

# 19. RBAC

Implement:

```text
RolesGuard
@Roles(...)
```

Example:

```typescript
@Roles(UserRole.SUPER_ADMIN)
```

Organization-level permissions must use `OrganizationMember.role`.

Workspace-level permissions must use `WorkspaceMember.role`.

Do not rely only on the platform role.

---

# 20. Phase 1.5 - Users

Implement:

```text
GET /users/me
GET /users/:id
PATCH /users/me
```

Do not allow normal users to modify:

```text
role
isActive
emailVerified
```

without appropriate authorization.

---

# 21. Phase 1.6 - Organizations

Implement:

```text
POST   /organizations
GET    /organizations
GET    /organizations/:id
PATCH  /organizations/:id
DELETE /organizations/:id
```

Creating an organization automatically creates:

```text
Organization
+
OrganizationMember(role=OWNER)
```

The creator becomes the owner.

---

# 22. Organization Authorization

Rules:

### OWNER

Can:

* update organization
* delete organization
* manage members
* create workspaces

### ADMIN

Can:

* manage members
* create workspaces
* update organization metadata

Cannot:

* delete organization
* transfer ownership

### MEMBER

Can:

* view organization
* access permitted workspaces

---

# 23. Phase 1.7 - Workspaces

Implement:

```text
POST   /workspaces
GET    /workspaces
GET    /workspaces/:id
PATCH  /workspaces/:id
DELETE /workspaces/:id
```

Workspace must belong to the user's organization.

Creating a workspace should automatically add the creator as:

```text
WorkspaceRole.ADMIN
```

---

# 24. Tenant Isolation

This is critical.

Every protected resource must verify:

```text
authenticated user
       ↓
organization membership
       ↓
workspace membership
       ↓
resource ownership
```

Never trust:

```text
organizationId
workspaceId
userId
```

from the client.

Derive the authenticated user from JWT and verify access server-side.

---

# 25. Phase 1.8 - Redis

Add Redis.

Use Redis for:

* caching
* rate limiting
* temporary state
* future BullMQ queues
* connector jobs
* AI processing jobs

Do not store permanent business data only in Redis.

Create a reusable Redis service.

---

# 26. Phase 1.9 - Rate Limiting

Implement rate limiting.

Different limits should eventually exist for:

```text
Authentication
Normal APIs
AI requests
Connector APIs
Admin APIs
```

AI requests should have stricter limits because humans apparently discovered that sending 40,000 prompts simultaneously is technically possible.

---

# 27. Phase 1.10 - Logging

Use:

```text
Pino
```

Logs should contain:

```text
timestamp
level
requestId
method
path
statusCode
duration
userId
organizationId
workspaceId
```

Never log:

```text
password
JWT
refresh token
API keys
authorization headers
```

---

# 28. Phase 1.11 - Health Checks

Implement:

```text
GET /health
GET /health/ready
GET /health/live
```

Readiness should verify:

```text
PostgreSQL
Redis
```

Liveness only verifies that the application process is alive.

---

# 29. Phase 1.12 - Docker

Create:

```text
Dockerfile
docker-compose.yml
.dockerignore
```

Docker Compose should run:

```text
backend
postgres
redis
```

Development should support:

```bash
docker compose up -d
```

---

# 30. Phase 1.13 - Testing

Use:

```text
Jest
Supertest
```

Minimum tests:

### Auth

* registration success
* duplicate email
* invalid email
* weak password
* login success
* invalid password
* inactive user
* refresh token
* logout

### Organizations

* create organization
* owner assignment
* unauthorized access
* member access
* admin access

### Workspaces

* create workspace
* workspace membership
* cross-organization access rejection

### Security

Test that:

```text
Organization A user
```

cannot access:

```text
Organization B data
```

This test is mandatory.

---

# 31. Phase 2 - Document Ingestion

After Phase 1 is complete, begin the RAG system.

Supported initial uploads:

```text
PDF
DOCX
TXT
Markdown
```

Pipeline:

```text
Upload
  ↓
File validation
  ↓
Text extraction
  ↓
Normalization
  ↓
Chunking
  ↓
Embedding
  ↓
PostgreSQL
```

---

# 32. Phase 2 Database Models

Introduce:

```text
Document
DocumentVersion
DocumentChunk
Embedding
DocumentMetadata
```

Every document must have:

```text
organizationId
workspaceId
```

---

# 33. Phase 2 - pgvector

Enable:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Store embeddings in PostgreSQL using pgvector.

Do not introduce Pinecone, Weaviate, Milvus, or another vector database unless there is a documented architectural reason.

The purpose of this project is to demonstrate PostgreSQL + pgvector.

---

# 34. Phase 3 - Retrieval

Implement:

```text
Vector Search
BM25 / PostgreSQL Full Text Search
Metadata Filtering
Hybrid Retrieval
Reranking
```

Pipeline:

```text
User Question
     ↓
Query preprocessing
     ↓
Vector search
     ↓
BM25 search
     ↓
Metadata filters
     ↓
Result fusion
     ↓
Reranking
     ↓
Top K chunks
```

---

# 35. Phase 4 - AI Chat

Implement:

```text
POST /chat
GET /conversations
GET /conversations/:id
DELETE /conversations/:id
```

AI flow:

```text
Question
   ↓
Conversation context
   ↓
Retriever
   ↓
Relevant chunks
   ↓
Prompt
   ↓
LLM
   ↓
Response
```

Use OpenAI Responses API initially.

Keep the LLM provider behind an abstraction so Claude can be added later.

---

# 36. Streaming

Use:

```text
SSE
```

for AI responses.

Flow:

```text
React
  │
  │ SSE
  ▼
NestJS
  │
  ▼
AI Service
  │
  ▼
LLM
```

The frontend must receive incremental output.

---

# 37. Source Citations

Every retrieved chunk must retain:

```text
documentId
documentName
chunkId
pageNumber
sourceUrl
metadata
```

AI responses must include citations.

Example:

```text
The company's PTO policy provides 24 annual leave days.

Sources:
[1] Employee Handbook - Page 14
[2] HR Policy - Page 7
```

The frontend must make citations clickable.

---

# 38. Phase 5 - Connectors

Implement connectors independently.

Initial connectors:

```text
Google Drive
GitHub
Notion
Confluence
Jira
Slack
SharePoint
PostgreSQL
```

Create a common connector interface:

```typescript
interface Connector {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;
  sync(): Promise<void>;
}
```

Each connector must implement this interface.

---

# 39. Incremental Indexing

Do NOT repeatedly re-index everything.

Track:

```text
externalId
externalUpdatedAt
lastSyncedAt
contentHash
syncCursor
```

Sync logic:

```text
Source
 ↓
Detect changes
 ↓
New/modified/deleted
 ↓
Process only changes
 ↓
Update index
```

---

# 40. Background Processing

Use:

```text
Redis
+
BullMQ
```

Jobs:

```text
connector-sync
document-processing
embedding-generation
document-delete
summary-generation
analytics-processing
```

Workers must support:

* retry
* exponential backoff
* failure tracking
* dead-letter handling

---

# 41. Phase 6 - Multi-Turn Memory

Store:

```text
Conversation
Message
ConversationSummary
```

Use:

```text
Recent messages
+
Conversation summary
+
Retrieved knowledge
```

Do not blindly send the entire conversation history to the model.

---

# 42. Phase 7 - AI Summaries

Support:

```text
Document summaries
Conversation summaries
Workspace summaries
Connector summaries
```

Store generated summaries.

Summaries can participate in retrieval.

---

# 43. Phase 8 - Feedback

Every AI response should support:

```text
thumbs up
thumbs down
comment
```

Store:

```text
userId
workspaceId
conversationId
messageId
retrievedChunks
feedback
comment
createdAt
```

This will later support RAG evaluation.

---

# 44. Phase 9 - Admin Dashboard

Dashboard metrics:

```text
Total users
Active users
Organizations
Workspaces
Documents
Indexed chunks
Queries
Average latency
Connector health
Failed jobs
```

---

# 45. Phase 10 - Cost Analytics

Track LLM usage.

Store:

```text
provider
model
inputTokens
outputTokens
totalTokens
estimatedCost
requestDuration
userId
organizationId
workspaceId
conversationId
```

Dashboard:

```text
Daily cost
Monthly cost
Cost per organization
Cost per user
Cost per model
Token usage
```

---

# 46. Phase 11 - RAG Evaluation

Implement evaluation metrics:

```text
Recall@K
Precision@K
MRR
Citation accuracy
Answer relevance
Faithfulness
Latency
Token cost
```

Create a small golden dataset.

Example:

```text
Question
Expected sources
Expected answer characteristics
```

Every retrieval change should be testable against this dataset.

---

# 47. Phase 12 - Production Hardening

Implement:

* request tracing
* correlation IDs
* structured logs
* retries
* circuit breakers
* database indexes
* connection pooling
* Redis health checks
* API rate limits
* graceful shutdown
* secure headers
* secret management
* database backup strategy
* audit logs

---

# 48. Phase 13 - Docker Production Setup

Create separate containers where justified:

```text
frontend
backend
ai-service
worker
postgres
redis
```

Do not create a separate container for every NestJS module.

---

# 49. Phase 14 - Kubernetes

Only after the Docker deployment is stable.

Create:

```text
Deployment
Service
ConfigMap
Secret
Ingress
HPA
PodDisruptionBudget
```

Scale independently:

```text
API
Workers
AI Service
```

---

# 50. API Standards

All APIs must follow:

```text
/api/v1/...
```

Examples:

```text
/api/v1/auth/login
/api/v1/users/me
/api/v1/organizations
/api/v1/workspaces
/api/v1/documents
/api/v1/connectors
/api/v1/conversations
/api/v1/chat
```

Use HTTP status codes correctly.

```text
200 OK
201 Created
202 Accepted
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

---

# 51. API Pagination

List endpoints must support:

```text
?page=1&limit=20
```

Maximum:

```text
limit=100
```

Return:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

# 52. Database Rules

Every important foreign key must have appropriate indexes.

Examples:

```text
organizationId
workspaceId
userId
createdAt
externalId
```

Use composite indexes where query patterns justify them.

Do not blindly index every column.

---

# 53. Security Requirements

Mandatory:

* bcrypt password hashing
* JWT authentication
* refresh token hashing
* RBAC
* tenant isolation
* DTO validation
* rate limiting
* CORS
* Helmet
* secure cookies where applicable
* secret environment variables
* no sensitive logging
* SQL injection protection through Prisma
* file upload validation
* file size limits
* MIME type validation

---

# 54. AI Security

The system must defend against:

### Prompt injection

Documents must never automatically override system instructions.

### Data exfiltration

The LLM must only receive chunks that the authenticated user is authorized to access.

### Cross-tenant retrieval

Vector search must always apply:

```text
organizationId
workspaceId
```

filters where applicable.

This is non-negotiable.

---

# 55. Connector Security

OAuth credentials and API tokens must never be stored in plaintext.

Use encryption at rest for sensitive connector credentials.

Never expose connector credentials through APIs.

---

# 56. Observability

Every significant operation should be traceable.

Example:

```text
requestId
    ↓
chat request
    ↓
retrieval request
    ↓
LLM request
    ↓
database queries
```

Record:

```text
latency
errors
tokens
model
retrieved chunk count
```

---

# 57. Coding Standards

Use:

```text
TypeScript strict mode
ESLint
Prettier
DTO validation
Dependency injection
async/await
explicit return types where useful
```

Avoid:

```text
any
console.log
hardcoded credentials
large god services
god controllers
business logic in controllers
duplicate database logic
```

Use `Logger` / Pino instead of `console.log`.

---

# 58. Testing Requirements

Every feature should contain:

```text
Unit tests
Integration tests
Authorization tests
```

Critical flows must have end-to-end tests.

Especially:

```text
Authentication
Tenant isolation
Workspace permissions
Document access
Retrieval authorization
```

---

# 59. Git Commit Strategy

Use conventional commits.

Examples:

```text
feat: add authentication module
feat: add organization management
feat: add workspace authorization
fix: prevent cross-tenant workspace access
refactor: extract user service
test: add authentication integration tests
docs: update API documentation
chore: upgrade dependencies
```

Do not make giant commits containing unrelated changes.

---

# 60. Cursor Implementation Rules

When implementing this PRD:

### Rule 1

First inspect the existing repository.

Do not blindly recreate files.

### Rule 2

Do not delete working functionality.

If restructuring is necessary, move/refactor it safely.

### Rule 3

Before modifying Prisma:

```text
inspect schema
inspect migrations
inspect generated client
```

### Rule 4

Never reset or delete the production database.

Never execute:

```bash
prisma migrate reset
```

unless explicitly instructed.

### Rule 5

Before each major phase:

1. inspect existing implementation
2. identify affected files
3. implement
4. run TypeScript compilation
5. run lint
6. run tests
7. run Prisma validation
8. report failures
9. fix failures
10. summarize changes

### Rule 6

Do not implement future phases prematurely.

If implementing Phase 1, do not introduce:

```text
RAG
embeddings
connectors
vector search
LLM calls
```

unless required as infrastructure.

### Rule 7

Do not add dependencies unnecessarily.

Before adding a package, determine whether the existing stack already solves the problem.

### Rule 8

Do not silently change architecture.

If an architectural decision needs to change, document the reason in:

```text
docs/architecture-decisions/
```

---

# 61. Definition of Done - Phase 1

Phase 1 is complete only when all of the following work.

## Infrastructure

```text
□ Node 22
□ NestJS 11
□ Prisma 6
□ PostgreSQL 17
□ Redis 8
□ Docker
```

## Authentication

```text
□ Register
□ Login
□ JWT
□ Refresh token
□ Logout
□ /auth/me
□ Password hashing
□ JWT guard
□ Public decorator
```

## Authorization

```text
□ Platform roles
□ Organization roles
□ Workspace roles
□ RolesGuard
□ Organization isolation
□ Workspace isolation
```

## Business Modules

```text
□ Users
□ Organizations
□ Workspaces
□ Health
```

## Infrastructure

```text
□ Config
□ Validation
□ Swagger
□ Logging
□ Exception filter
□ Response interceptor
□ Redis
□ Rate limiting
```

## Testing

```text
□ Unit tests
□ Integration tests
□ Auth tests
□ Authorization tests
□ Tenant isolation tests
```

## Deployment

```text
□ Dockerfile
□ docker-compose.yml
□ .env.example
□ README
```

---

# 62. Definition of Done - Entire Project

The entire project is complete when a new organization can:

```text
Register
   ↓
Create Organization
   ↓
Create Workspace
   ↓
Connect Google Drive
   ↓
Synchronize documents
   ↓
Index documents
   ↓
Ask a question
   ↓
Hybrid retrieval
   ↓
LLM generation
   ↓
Streaming answer
   ↓
Source citations
   ↓
Give feedback
   ↓
View usage/cost
```

while maintaining strict:

```text
authentication
authorization
tenant isolation
observability
security
```

---

# 63. Expected Final Product

The final product should demonstrate the following engineering capabilities:

```text
Backend Engineering
        +
System Design
        +
RAG
        +
Embeddings
        +
Vector Databases
        +
Hybrid Search
        +
LLM Integration
        +
AI Agents
        +
Distributed Jobs
        +
Redis
        +
PostgreSQL
        +
Multi-Tenancy
        +
RBAC
        +
Enterprise Integrations
        +
Observability
        +
Production Deployment
```

The goal is not merely to create a chatbot.

The goal is to build a **production-style enterprise AI knowledge platform**.

---

# 64. Cursor Execution Requirement

Implement the project **phase by phase**.

For each phase:

```text
1. Inspect current implementation.
2. Explain planned changes briefly.
3. Implement the phase.
4. Run formatting.
5. Run lint.
6. Run TypeScript build.
7. Run tests.
8. Run Prisma validation/migration checks where applicable.
9. Fix all errors introduced by the implementation.
10. Do not move to the next phase until the current phase passes.
11. Provide a concise implementation report.
```

Do not claim a phase is complete merely because files were created.

A phase is complete only when the application builds and the relevant tests pass.

---

# 65. First Task for Cursor

Start with **Phase 1 only**.

Before modifying anything:

```text
1. Inspect package.json.
2. Inspect package-lock.json.
3. Inspect tsconfig files.
4. Inspect Prisma schema and migrations.
5. Inspect all existing src files.
6. Determine which parts of Phase 1 are already implemented.
7. Do not overwrite working code unnecessarily.
8. Create an implementation plan based on the actual repository.
9. Implement only the missing Phase 1 requirements.
10. Validate the complete Phase 1 implementation.
```

Do not begin Phase 2 until Phase 1 has passed all validation.

**Important:** The existing repository is the source of truth for what is already implemented. This PRD defines the target architecture and requirements, not permission to blindly rewrite the codebase.
