Memora — ₹0 Free-Tier Deployment Plan
1. Goal
Deploy the Memora enterprise knowledge assistant using free-tier services only, targeting ₹0 deployment cost for development/demo traffic.

Memora:

Connects internal knowledge sources

Indexes documents and chunks

Generates embeddings

Performs vector/hybrid retrieval

Applies tenant/RBAC filtering

Generates answers with citations

Streams responses through SSE

Important: ₹0 means staying within the current free allocations and limits of each provider. It does not mean unlimited production usage.

2. Target Architecture
                         ┌──────────────────────┐
                         │   Cloudflare Pages   │
                         │   React Frontend     │
                         └──────────┬───────────┘
                                    │ HTTPS
                                    ▼
                         ┌──────────────────────┐
                         │ Cloudflare Workers   │
                         │                      │
                         │ API / Auth           │
                         │ RAG orchestration    │
                         │ SSE streaming        │
                         │ Rate limiting        │
                         └───────┬───────┬──────┘
                                 │       │
                    ┌────────────┘       └────────────┐
                    ▼                                 ▼
          ┌──────────────────┐              ┌──────────────────┐
          │ Supabase         │              │ Cloudflare       │
          │ PostgreSQL       │              │ Workers AI       │
          │                  │              │                  │
          │ pgvector         │              │ LLM              │
          │ documents        │              │ embeddings       │
          │ chunks           │              │ reranking        │
          │ users/RBAC       │              └──────────────────┘
          └──────────────────┘
                    │
                    ▼
          ┌──────────────────┐
          │ Upstash Redis    │
          │                  │
          │ cache / jobs     │
          │ rate limiting    │
          └──────────────────┘

          ┌──────────────────┐
          │ Cloudflare R2    │
          │                  │
          │ PDF/DOCX/files   │
          └──────────────────┘
3. Free-Tier Technology Stack
Component	Platform	Purpose
Frontend	Cloudflare Pages	React UI
Backend	Cloudflare Workers	API, auth middleware, RAG orchestration
LLM	Cloudflare Workers AI	Chat generation
Embeddings	Cloudflare Workers AI	Embedding generation
PostgreSQL	Supabase	Main database + pgvector
Redis	Upstash	Cache, rate limiting, temporary state
Object Storage	Cloudflare R2	Original documents/files
Authentication	Supabase Auth	User authentication
Streaming	Cloudflare Workers SSE	Streaming AI responses
Source Control	GitHub	Repository + CI/CD
4. Important Model Decision
Do NOT self-host the 16B Hugging Face model initially
A dense 16B model requires substantial memory:

FP16   ≈ 32 GB just for model weights
INT8   ≈ 16 GB
4-bit   ≈ 8 GB
Actual inference requires additional memory for runtime overhead, KV cache, activations, etc.

Therefore:

Hugging Face 16B
        ↓
Own GPU
        ↓
Not realistically ₹0
Instead:

Cloudflare Worker
        ↓
Workers AI
        ↓
Cloudflare-hosted model
Use a model available through Workers AI for the initial deployment.

5. Keep the LLM Layer Provider-Agnostic
Create an abstraction so the model can be changed later without rewriting the RAG system.

interface LLMProvider {
  generate(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<string>;
}
Possible providers:

LLMProvider
    │
    ├── WorkersAIProvider
    │
    ├── OpenAIProvider
    │
    └── HuggingFaceProvider
Initial implementation:

WorkersAIProvider
Future implementation:

HuggingFaceProvider
        ↓
Your 16B model
        ↓
GPU inference server
6. Memora RAG Flow
                  User
                   │
                   ▼
             React frontend
                   │
                   ▼
           Cloudflare Worker
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
     Supabase Auth       RAG Pipeline
                            │
                            ▼
                     Query processing
                            │
                            ▼
                     Generate embedding
                            │
                            ▼
                     pgvector search
                            │
                            ▼
                       Top K chunks
                            │
                            ▼
                       Reranking
                            │
                            ▼
                     Workers AI LLM
                            │
                            ▼
                       SSE stream
                            │
                            ▼
                         React
7. Document Ingestion
Initial connector targets:

Google Drive
Confluence
Notion
Jira
Slack
GitHub
SharePoint
Do not create a permanent worker/service for every connector.

Use the Worker as the orchestration layer.

Connector
   ↓
Cloudflare Worker
   ↓
Download document
   ↓
Parse
   ↓
Chunk
   ↓
Generate embeddings
   ↓
Store vectors in PostgreSQL
   ↓
Store original file in R2
8. Document Data Model
Recommended initial tables:

documents
document_versions
document_chunks
document_metadata
document_permissions
Example:

CREATE TABLE documents (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(...),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
Enable pgvector:

CREATE EXTENSION IF NOT EXISTS vector;
Vector search:

SELECT
    id,
    content,
    metadata
FROM document_chunks
WHERE tenant_id = $tenant_id
ORDER BY embedding <=> $query_embedding
LIMIT 10;
9. Embedding Pipeline
Do not use paid OpenAI embeddings if the goal is ₹0.

Use an embedding model available through Workers AI.

Document indexing:

Document
   ↓
Text extraction
   ↓
Chunking
   ↓
Workers AI embedding
   ↓
Vector
   ↓
PostgreSQL pgvector
Query:

Question
   ↓
Workers AI embedding
   ↓
pgvector similarity search
   ↓
Top K chunks
10. PostgreSQL
Use Supabase PostgreSQL with pgvector.

PostgreSQL remains the source of truth.

Recommended data:

users
tenants
memberships
roles
permissions
documents
document_versions
document_chunks
document_permissions
conversations
messages
citations
Do not use Redis as the primary database.

11. Redis
Use Upstash Redis only for temporary/high-speed operations.

Recommended uses:

query cache
rate limiting
ingestion state
temporary jobs
session-related cache
Architecture:

PostgreSQL
    ↓
Permanent source of truth

Redis
    ↓
Temporary/cache state
If Redis becomes unavailable, the core RAG system should still be able to operate, although caching and temporary workflows may degrade.

12. Object Storage
Use Cloudflare R2 for original files:

PDF
DOCX
TXT
CSV
Images
Other supported documents
Example:

R2
│
├── tenant-1/
│   ├── document-a.pdf
│   └── document-b.docx
│
└── tenant-2/
    └── document-c.pdf
PostgreSQL stores metadata:

document_id
r2_key
filename
mime_type
size
hash
version
Do not store large original files directly inside PostgreSQL.

13. Authentication
Use Supabase Auth.

Flow:

React
  ↓
Supabase Login
  ↓
JWT
  ↓
Cloudflare Worker
  ↓
Validate JWT
  ↓
Resolve tenant/user
  ↓
RBAC
  ↓
RAG
Core entities:

User
 ↓
Membership
 ↓
Role
 ↓
Permissions
 ↓
Document Access
14. RAG Security
Authorization must be applied during retrieval.

Avoid:

Question
   ↓
Vector search
   ↓
Retrieve everything
   ↓
Filter unauthorized documents
Prefer:

Question
   ↓
User identity
   ↓
Tenant / permission filters
   ↓
Vector search
   ↓
Authorized chunks
Conceptually:

SELECT
    id,
    content,
    metadata
FROM document_chunks
WHERE tenant_id = $tenant_id
  AND is_accessible = true
ORDER BY embedding <=> $query_embedding
LIMIT 10;
For a multi-tenant enterprise knowledge assistant, retrieving another user's/tenant's document is a security bug.

15. SSE Streaming
Use Server-Sent Events for ChatGPT-style streaming.

React
  │
  │ GET /chat/stream
  ▼
Cloudflare Worker
  │
  │ RAG
  ▼
Workers AI
  │
  │ token stream
  ▼
Worker
  │
  │ SSE
  ▼
React
Example event flow:

event: token
data: PostgreSQL

event: token
data: uses

event: token
data: indexes

event: source
data: document-123

event: done
data: {}
16. API Structure
Recommended initial APIs:

POST /auth/...
POST /documents
POST /documents/:id/index
GET  /documents
GET  /documents/:id
DELETE /documents/:id

POST /search

POST /chat
GET  /chat/stream

GET  /conversations
GET  /conversations/:id
POST /conversations

POST /files/upload
GET  /files/:id
DELETE /files/:id
17. Backend Structure
Keep the backend modular and provider-agnostic.

src/
├── auth/
├── tenants/
├── users/
├── rbac/
├── documents/
├── ingestion/
├── embeddings/
├── retrieval/
├── rag/
├── conversations/
├── citations/
├── llm/
│   ├── llm.interface.ts
│   └── workers-ai.provider.ts
├── storage/
│   └── r2.provider.ts
├── cache/
│   └── redis.provider.ts
└── database/
18. Deployment Phases
Phase 1 — PostgreSQL
Create Supabase project.

Enable:

CREATE EXTENSION IF NOT EXISTS vector;
Create:

users
tenants
memberships
roles
permissions
documents
document_versions
document_chunks
document_permissions
conversations
messages
citations
Verify:

PostgreSQL connection

pgvector

indexes

tenant isolation

Phase 2 — Workers AI
Create a minimal Worker endpoint:

GET /test-ai
Test:

Worker
  ↓
Workers AI
  ↓
LLM response
Then test embeddings:

Worker
  ↓
Embedding model
  ↓
Vector
Phase 3 — Basic RAG
Implement:

POST /documents
POST /documents/:id/index
POST /search
POST /chat
GET  /chat/stream
Pipeline:

Question
 ↓
Embedding
 ↓
Vector search
 ↓
Permission filtering
 ↓
Top K chunks
 ↓
Prompt construction
 ↓
Workers AI
 ↓
SSE
Phase 4 — R2
Implement:

POST /files/upload
GET /files/:id
DELETE /files/:id
Flow:

File
 ↓
R2
 ↓
Document metadata
 ↓
Text extraction
 ↓
Chunking
 ↓
Embedding
 ↓
pgvector
Phase 5 — Authentication
Implement:

signup
login
logout
JWT
tenant
RBAC
document permissions
Test:

User A → Tenant A documents → allowed
User A → Tenant B documents → denied
Phase 6 — Redis
Add:

query cache
rate limiting
ingestion status
temporary state
Redis should remain optional to the core request path where possible.

Phase 7 — Frontend
Deploy React to Cloudflare Pages.

Configuration:

VITE_API_URL=https://your-worker.workers.dev
Flow:

React
 ↓
Cloudflare Worker
 ↓
Supabase
 ↓
Workers AI
19. GitHub CI/CD
Repository:

memora/
├── frontend/
├── worker/
├── shared/
└── README.md
Deployment:

Git push
    │
    ├── Cloudflare Pages
    │       ↓
    │    Frontend
    │
    └── Cloudflare Workers
            ↓
          Backend
Jenkins is not required for the initial free deployment.

20. Components to Avoid Initially
Do not deploy these for the first ₹0 version:

❌ Kubernetes
❌ Docker Swarm
❌ AWS EC2
❌ Dedicated GPU server
❌ Self-hosted 16B model
❌ Kafka
❌ RabbitMQ
❌ Elasticsearch
❌ Separate vector database
❌ Separate authentication service
❌ Separate API gateway
The goal is a simple system that works, not a diagram containing every technology humans have invented.

21. Final Free-Tier Stack
                 MEMORA
                   │
       ┌───────────┴───────────┐
       │                       │
 Cloudflare Pages       Cloudflare Workers
 React UI                API + RAG
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
          Supabase        Workers AI         Upstash
          PostgreSQL      LLM + Embedding    Redis
          + pgvector
              │
              ▼
        Cloudflare R2
        Documents
Target cost:

Cloudflare Pages       ₹0
Cloudflare Workers     ₹0*
Workers AI             ₹0*
Supabase               ₹0*
Upstash                ₹0*
R2                     ₹0*
GitHub                 ₹0
Domain                 ₹0 (workers.dev/pages.dev)
──────────────────────────────
Target                 ₹0
* Subject to current free-tier allocations, quotas, and provider terms.

22. Recommended First Milestone
Do not start by implementing all seven connectors.

First make this work:

React
  ↓
Cloudflare Worker
  ↓
Authentication
  ↓
Document upload
  ↓
R2
  ↓
Text extraction
  ↓
Chunking
  ↓
Workers AI embeddings
  ↓
Supabase pgvector
  ↓
Permission-aware retrieval
  ↓
Workers AI LLM
  ↓
SSE
  ↓
React
Once this works, add connectors one by one:

1. Google Drive
2. GitHub
3. Notion
4. Confluence
5. Jira
6. Slack
7. SharePoint
23. Future 16B Hugging Face Model Path
The architecture should allow:

                  TODAY
                    │
                    ▼
          ┌──────────────────┐
          │ Workers AI       │
          │ Free Allocation  │
          └────────┬─────────┘
                   │
                   │ same LLM interface
                   ▼
                  LATER
          ┌──────────────────┐
          │ Hugging Face     │
          │ 16B Model        │
          │                  │
          │ GPU Inference    │
          └──────────────────┘
The RAG system should not depend directly on the model provider.

This allows the LLM to be replaced without redesigning:

authentication
documents
chunking
embeddings
retrieval
RBAC
citations
conversations
frontend
24. Final Recommendation
For the first Memora deployment:

Frontend       → Cloudflare Pages
Backend        → Cloudflare Workers
LLM            → Workers AI
Embeddings     → Workers AI
Database       → Supabase PostgreSQL + pgvector
Redis          → Upstash
Files          → Cloudflare R2
Auth           → Supabase Auth
Streaming      → SSE
Source Control → GitHub
The primary objective is:

Build a complete, secure, multi-tenant RAG application within free-tier limits first. Optimize model size and add a custom Hugging Face 16B model only when a suitable GPU becomes available.

This provides a practical ₹0 starting point while keeping the architecture ready for future migration to dedicated GPU inference.Memora — ₹0 Free-Tier Deployment Plan
1. Goal
Deploy the Memora enterprise knowledge assistant using free-tier services only, targeting ₹0 deployment cost for development/demo traffic.

Memora:

Connects internal knowledge sources

Indexes documents and chunks

Generates embeddings

Performs vector/hybrid retrieval

Applies tenant/RBAC filtering

Generates answers with citations

Streams responses through SSE

Important: ₹0 means staying within the current free allocations and limits of each provider. It does not mean unlimited production usage.

2. Target Architecture
                         ┌──────────────────────┐
                         │   Cloudflare Pages   │
                         │   React Frontend     │
                         └──────────┬───────────┘
                                    │ HTTPS
                                    ▼
                         ┌──────────────────────┐
                         │ Cloudflare Workers   │
                         │                      │
                         │ API / Auth           │
                         │ RAG orchestration    │
                         │ SSE streaming        │
                         │ Rate limiting        │
                         └───────┬───────┬──────┘
                                 │       │
                    ┌────────────┘       └────────────┐
                    ▼                                 ▼
          ┌──────────────────┐              ┌──────────────────┐
          │ Supabase         │              │ Cloudflare       │
          │ PostgreSQL       │              │ Workers AI       │
          │                  │              │                  │
          │ pgvector         │              │ LLM              │
          │ documents        │              │ embeddings       │
          │ chunks           │              │ reranking        │
          │ users/RBAC       │              └──────────────────┘
          └──────────────────┘
                    │
                    ▼
          ┌──────────────────┐
          │ Upstash Redis    │
          │                  │
          │ cache / jobs     │
          │ rate limiting    │
          └──────────────────┘

          ┌──────────────────┐
          │ Cloudflare R2    │
          │                  │
          │ PDF/DOCX/files   │
          └──────────────────┘
3. Free-Tier Technology Stack
Component	Platform	Purpose
Frontend	Cloudflare Pages	React UI
Backend	Cloudflare Workers	API, auth middleware, RAG orchestration
LLM	Cloudflare Workers AI	Chat generation
Embeddings	Cloudflare Workers AI	Embedding generation
PostgreSQL	Supabase	Main database + pgvector
Redis	Upstash	Cache, rate limiting, temporary state
Object Storage	Cloudflare R2	Original documents/files
Authentication	Supabase Auth	User authentication
Streaming	Cloudflare Workers SSE	Streaming AI responses
Source Control	GitHub	Repository + CI/CD
4. Important Model Decision
Do NOT self-host the 16B Hugging Face model initially
A dense 16B model requires substantial memory:

FP16   ≈ 32 GB just for model weights
INT8   ≈ 16 GB
4-bit   ≈ 8 GB
Actual inference requires additional memory for runtime overhead, KV cache, activations, etc.

Therefore:

Hugging Face 16B
        ↓
Own GPU
        ↓
Not realistically ₹0
Instead:

Cloudflare Worker
        ↓
Workers AI
        ↓
Cloudflare-hosted model
Use a model available through Workers AI for the initial deployment.

5. Keep the LLM Layer Provider-Agnostic
Create an abstraction so the model can be changed later without rewriting the RAG system.

interface LLMProvider {
  generate(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<string>;
}
Possible providers:

LLMProvider
    │
    ├── WorkersAIProvider
    │
    ├── OpenAIProvider
    │
    └── HuggingFaceProvider
Initial implementation:

WorkersAIProvider
Future implementation:

HuggingFaceProvider
        ↓
Your 16B model
        ↓
GPU inference server
6. Memora RAG Flow
                  User
                   │
                   ▼
             React frontend
                   │
                   ▼
           Cloudflare Worker
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
     Supabase Auth       RAG Pipeline
                            │
                            ▼
                     Query processing
                            │
                            ▼
                     Generate embedding
                            │
                            ▼
                     pgvector search
                            │
                            ▼
                       Top K chunks
                            │
                            ▼
                       Reranking
                            │
                            ▼
                     Workers AI LLM
                            │
                            ▼
                       SSE stream
                            │
                            ▼
                         React
7. Document Ingestion
Initial connector targets:

Google Drive
Confluence
Notion
Jira
Slack
GitHub
SharePoint
Do not create a permanent worker/service for every connector.

Use the Worker as the orchestration layer.

Connector
   ↓
Cloudflare Worker
   ↓
Download document
   ↓
Parse
   ↓
Chunk
   ↓
Generate embeddings
   ↓
Store vectors in PostgreSQL
   ↓
Store original file in R2
8. Document Data Model
Recommended initial tables:

documents
document_versions
document_chunks
document_metadata
document_permissions
Example:

CREATE TABLE documents (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(...),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
Enable pgvector:

CREATE EXTENSION IF NOT EXISTS vector;
Vector search:

SELECT
    id,
    content,
    metadata
FROM document_chunks
WHERE tenant_id = $tenant_id
ORDER BY embedding <=> $query_embedding
LIMIT 10;
9. Embedding Pipeline
Do not use paid OpenAI embeddings if the goal is ₹0.

Use an embedding model available through Workers AI.

Document indexing:

Document
   ↓
Text extraction
   ↓
Chunking
   ↓
Workers AI embedding
   ↓
Vector
   ↓
PostgreSQL pgvector
Query:

Question
   ↓
Workers AI embedding
   ↓
pgvector similarity search
   ↓
Top K chunks
10. PostgreSQL
Use Supabase PostgreSQL with pgvector.

PostgreSQL remains the source of truth.

Recommended data:

users
tenants
memberships
roles
permissions
documents
document_versions
document_chunks
document_permissions
conversations
messages
citations
Do not use Redis as the primary database.

11. Redis
Use Upstash Redis only for temporary/high-speed operations.

Recommended uses:

query cache
rate limiting
ingestion state
temporary jobs
session-related cache
Architecture:

PostgreSQL
    ↓
Permanent source of truth

Redis
    ↓
Temporary/cache state
If Redis becomes unavailable, the core RAG system should still be able to operate, although caching and temporary workflows may degrade.

12. Object Storage
Use Cloudflare R2 for original files:

PDF
DOCX
TXT
CSV
Images
Other supported documents
Example:

R2
│
├── tenant-1/
│   ├── document-a.pdf
│   └── document-b.docx
│
└── tenant-2/
    └── document-c.pdf
PostgreSQL stores metadata:

document_id
r2_key
filename
mime_type
size
hash
version
Do not store large original files directly inside PostgreSQL.

13. Authentication
Use Supabase Auth.

Flow:

React
  ↓
Supabase Login
  ↓
JWT
  ↓
Cloudflare Worker
  ↓
Validate JWT
  ↓
Resolve tenant/user
  ↓
RBAC
  ↓
RAG
Core entities:

User
 ↓
Membership
 ↓
Role
 ↓
Permissions
 ↓
Document Access
14. RAG Security
Authorization must be applied during retrieval.

Avoid:

Question
   ↓
Vector search
   ↓
Retrieve everything
   ↓
Filter unauthorized documents
Prefer:

Question
   ↓
User identity
   ↓
Tenant / permission filters
   ↓
Vector search
   ↓
Authorized chunks
Conceptually:

SELECT
    id,
    content,
    metadata
FROM document_chunks
WHERE tenant_id = $tenant_id
  AND is_accessible = true
ORDER BY embedding <=> $query_embedding
LIMIT 10;
For a multi-tenant enterprise knowledge assistant, retrieving another user's/tenant's document is a security bug.

15. SSE Streaming
Use Server-Sent Events for ChatGPT-style streaming.

React
  │
  │ GET /chat/stream
  ▼
Cloudflare Worker
  │
  │ RAG
  ▼
Workers AI
  │
  │ token stream
  ▼
Worker
  │
  │ SSE
  ▼
React
Example event flow:

event: token
data: PostgreSQL

event: token
data: uses

event: token
data: indexes

event: source
data: document-123

event: done
data: {}
16. API Structure
Recommended initial APIs:

POST /auth/...
POST /documents
POST /documents/:id/index
GET  /documents
GET  /documents/:id
DELETE /documents/:id

POST /search

POST /chat
GET  /chat/stream

GET  /conversations
GET  /conversations/:id
POST /conversations

POST /files/upload
GET  /files/:id
DELETE /files/:id
17. Backend Structure
Keep the backend modular and provider-agnostic.

src/
├── auth/
├── tenants/
├── users/
├── rbac/
├── documents/
├── ingestion/
├── embeddings/
├── retrieval/
├── rag/
├── conversations/
├── citations/
├── llm/
│   ├── llm.interface.ts
│   └── workers-ai.provider.ts
├── storage/
│   └── r2.provider.ts
├── cache/
│   └── redis.provider.ts
└── database/
18. Deployment Phases
Phase 1 — PostgreSQL
Create Supabase project.

Enable:

CREATE EXTENSION IF NOT EXISTS vector;
Create:

users
tenants
memberships
roles
permissions
documents
document_versions
document_chunks
document_permissions
conversations
messages
citations
Verify:

PostgreSQL connection

pgvector

indexes

tenant isolation

Phase 2 — Workers AI
Create a minimal Worker endpoint:

GET /test-ai
Test:

Worker
  ↓
Workers AI
  ↓
LLM response
Then test embeddings:

Worker
  ↓
Embedding model
  ↓
Vector
Phase 3 — Basic RAG
Implement:

POST /documents
POST /documents/:id/index
POST /search
POST /chat
GET  /chat/stream
Pipeline:

Question
 ↓
Embedding
 ↓
Vector search
 ↓
Permission filtering
 ↓
Top K chunks
 ↓
Prompt construction
 ↓
Workers AI
 ↓
SSE
Phase 4 — R2
Implement:

POST /files/upload
GET /files/:id
DELETE /files/:id
Flow:

File
 ↓
R2
 ↓
Document metadata
 ↓
Text extraction
 ↓
Chunking
 ↓
Embedding
 ↓
pgvector
Phase 5 — Authentication
Implement:

signup
login
logout
JWT
tenant
RBAC
document permissions
Test:

User A → Tenant A documents → allowed
User A → Tenant B documents → denied
Phase 6 — Redis
Add:

query cache
rate limiting
ingestion status
temporary state
Redis should remain optional to the core request path where possible.

Phase 7 — Frontend
Deploy React to Cloudflare Pages.

Configuration:

VITE_API_URL=https://your-worker.workers.dev
Flow:

React
 ↓
Cloudflare Worker
 ↓
Supabase
 ↓
Workers AI
19. GitHub CI/CD
Repository:

memora/
├── frontend/
├── worker/
├── shared/
└── README.md
Deployment:

Git push
    │
    ├── Cloudflare Pages
    │       ↓
    │    Frontend
    │
    └── Cloudflare Workers
            ↓
          Backend
Jenkins is not required for the initial free deployment.

20. Components to Avoid Initially
Do not deploy these for the first ₹0 version:

❌ Kubernetes
❌ Docker Swarm
❌ AWS EC2
❌ Dedicated GPU server
❌ Self-hosted 16B model
❌ Kafka
❌ RabbitMQ
❌ Elasticsearch
❌ Separate vector database
❌ Separate authentication service
❌ Separate API gateway
The goal is a simple system that works, not a diagram containing every technology humans have invented.

21. Final Free-Tier Stack
                 MEMORA
                   │
       ┌───────────┴───────────┐
       │                       │
 Cloudflare Pages       Cloudflare Workers
 React UI                API + RAG
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
          Supabase        Workers AI         Upstash
          PostgreSQL      LLM + Embedding    Redis
          + pgvector
              │
              ▼
        Cloudflare R2
        Documents
Target cost:

Cloudflare Pages       ₹0
Cloudflare Workers     ₹0*
Workers AI             ₹0*
Supabase               ₹0*
Upstash                ₹0*
R2                     ₹0*
GitHub                 ₹0
Domain                 ₹0 (workers.dev/pages.dev)
──────────────────────────────
Target                 ₹0
* Subject to current free-tier allocations, quotas, and provider terms.

22. Recommended First Milestone
Do not start by implementing all seven connectors.

First make this work:

React
  ↓
Cloudflare Worker
  ↓
Authentication
  ↓
Document upload
  ↓
R2
  ↓
Text extraction
  ↓
Chunking
  ↓
Workers AI embeddings
  ↓
Supabase pgvector
  ↓
Permission-aware retrieval
  ↓
Workers AI LLM
  ↓
SSE
  ↓
React
Once this works, add connectors one by one:

1. Google Drive
2. GitHub
3. Notion
4. Confluence
5. Jira
6. Slack
7. SharePoint
23. Future 16B Hugging Face Model Path
The architecture should allow:

                  TODAY
                    │
                    ▼
          ┌──────────────────┐
          │ Workers AI       │
          │ Free Allocation  │
          └────────┬─────────┘
                   │
                   │ same LLM interface
                   ▼
                  LATER
          ┌──────────────────┐
          │ Hugging Face     │
          │ 16B Model        │
          │                  │
          │ GPU Inference    │
          └──────────────────┘
The RAG system should not depend directly on the model provider.

This allows the LLM to be replaced without redesigning:

authentication
documents
chunking
embeddings
retrieval
RBAC
citations
conversations
frontend
24. Final Recommendation
For the first Memora deployment:

Frontend       → Cloudflare Pages
Backend        → Cloudflare Workers
LLM            → Workers AI
Embeddings     → Workers AI
Database       → Supabase PostgreSQL + pgvector
Redis          → Upstash
Files          → Cloudflare R2
Auth           → Supabase Auth
Streaming      → SSE
Source Control → GitHub
The primary objective is:

Build a complete, secure, multi-tenant RAG application within free-tier limits first. Optimize model size and add a custom Hugging Face 16B model only when a suitable GPU becomes available.

This provides a practical ₹0 starting point while keeping the architecture ready for future migration to dedicated GPU inference.