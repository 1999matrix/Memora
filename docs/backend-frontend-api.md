# Memora Backend API — Frontend Integration Guide

Reference for building the **React** frontend against the NestJS backend.  
Source of truth: `backend/src` (controllers, DTOs, services). Swagger UI: `http://localhost:<PORT>/docs`.

---

## 1. Quick start

| Item | Value |
|------|--------|
| Default base URL (dev) | `http://localhost:7000` (see `PORT` in `backend/.env`) |
| API prefix | `/api/v1` |
| Health (no prefix) | `/health`, `/health/live`, `/health/ready` |
| Swagger | `/docs` |
| Auth | Bearer JWT (`Authorization: Bearer <accessToken>`) |
| Content type | `application/json` (except document upload) |
| CORS | Enabled (`origin: true`, `credentials: true`) |

Example:

```
POST http://localhost:7000/api/v1/auth/login
GET  http://localhost:7000/api/v1/workspaces
GET  http://localhost:7000/health
```

Suggested env for React (`VITE_*` / `NEXT_PUBLIC_*`):

```env
VITE_API_BASE_URL=http://localhost:7000
```

Client base path for JSON APIs: `${VITE_API_BASE_URL}/api/v1`.

---

## 2. Response envelope

Almost every JSON endpoint is wrapped:

```ts
// Success
{ success: true, data: T }

// Error
{
  success: false,
  statusCode: number,
  path: string,
  timestamp: string, // ISO
  message: string | string[]
}
```

**Exception:** chat streaming (`POST .../chat`) uses raw **SSE** and does **not** use `{ success, data }`.

Always read payload from `response.data` after a successful call (Axios) or unwrap `json.data` after `fetch`.

---

## 3. Authentication

### 3.1 Tokens

| Token | Lifetime (default) | Storage (recommended) |
|-------|--------------------|------------------------|
| `accessToken` | `15m` | Memory or short-lived storage |
| `refreshToken` | `7d` | `httpOnly` cookie preferred; if SPA-only, secure storage + refresh on 401 |

Header on protected routes:

```http
Authorization: Bearer <accessToken>
```

JWT payload (decoded): `{ sub: userId, email, role }`.

### 3.2 Auth endpoints

Base: `/api/v1/auth`

| Method | Path | Auth | Body | Notes |
|--------|------|------|------|-------|
| `POST` | `/register` | Public | RegisterDto | Rate limit 5/min |
| `POST` | `/login` | Public | LoginDto | Rate limit 5/min |
| `POST` | `/refresh` | Public | `{ refreshToken }` | Rate limit 10/min |
| `POST` | `/logout` | Bearer | — | Clears server refresh hash |
| `GET` | `/me` | Bearer | — | Current user |

**RegisterDto**

```ts
{
  email: string;       // email
  password: string;    // min 8
  firstName: string;   // min 1
  lastName: string;    // min 1
}
```

**LoginDto**

```ts
{ email: string; password: string; /* min 8 */ }
```

**Register / login success `data`**

```ts
{
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}
```

**Refresh success `data`**

```ts
{ accessToken: string; refreshToken: string }
```

**Logout `data`:** `{ success: true }`  
**Me `data`:** `SafeUser`

```ts
type SafeUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'USER';
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

### 3.3 Suggested React auth flow

1. Login/register → store tokens + user.
2. Attach `Authorization` on all `/api/v1/*` calls except public auth/health.
3. On `401`, call `POST /auth/refresh` with `refreshToken`; retry original request once.
4. If refresh fails → clear session → redirect to login.
5. Logout → `POST /auth/logout` then clear local state.

There is **no** org/workspace header. Scope is always via path params (`workspaceId`, org `id`, etc.).

---

## 4. Global rules

### 4.1 Pagination

Query: `?page=1&limit=20` (defaults: page `1`, limit `20`, max `100`).

Paginated `data` shape:

```ts
{
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

Used by: organizations list, workspaces list, documents list.

### 4.2 Roles

**Platform (`User.role`)**

| Role | UI |
|------|-----|
| `USER` | Normal app |
| `SUPER_ADMIN` | Admin dashboard, analytics costs, evaluation |

**Organization**

| Role | Typical powers |
|------|----------------|
| `OWNER` | Full org control (created as OWNER) |
| `ADMIN` | Manage members / org (per service checks) |
| `MEMBER` | Access |

**Workspace**

| Role |
|------|
| `ADMIN` |
| `MEMBER` |

Add-member APIs invite by **email** (user must already exist).

### 4.3 Throttling

Default: **100 requests / 60s** per client (Redis-backed). Auth login/register tighter (5/min). Expect `429` when exceeded.

### 4.4 Correlation ID

Optional request header: `x-correlation-id`.  
Response always includes `x-correlation-id` (echoed or generated). Useful for support logs.

### 4.5 IDs

All entity IDs are **cuid** strings (e.g. `clx...`), not UUIDs.

---

## 5. Domain model (frontend-relevant)

```
User
 └─ OrganizationMember → Organization
      └─ Workspace (via WorkspaceMember)
           ├─ Document (status: PENDING | PROCESSING | READY | FAILED)
           ├─ Connector (type + status)
           ├─ Conversation → Message (+ MessageFeedback)
           └─ KnowledgeSummary (DOCUMENT | WORKSPACE | CONNECTOR)
```

Document processing and connector sync are **async** (BullMQ). Poll document `status` until `READY` / `FAILED`.

---

## 6. Users

Base: `/api/v1/users` (Bearer)

| Method | Path | Body | Response `data` |
|--------|------|------|-----------------|
| `GET` | `/me` | — | `SafeUser` |
| `PATCH` | `/me` | UpdateUserDto | `SafeUser` |
| `GET` | `/:id` | — | `SafeUser` (self or `SUPER_ADMIN`) |

**UpdateUserDto** (all optional): `{ firstName?, lastName?, password? }`

---

## 7. Organizations

Base: `/api/v1/organizations` (Bearer)

| Method | Path | Body |
|--------|------|------|
| `POST` | `/` | `{ name }` (min 2) |
| `GET` | `/` | Query pagination |
| `GET` | `/:id` | — |
| `PATCH` | `/:id` | `{ name? }` |
| `DELETE` | `/:id` | — |
| `GET` | `/:id/members` | — |
| `POST` | `/:id/members` | `{ email, role: 'ADMIN' \| 'MEMBER' }` |
| `PATCH` | `/:id/members/:userId` | `{ role: 'OWNER' \| 'ADMIN' \| 'MEMBER' }` |
| `DELETE` | `/:id/members/:userId` | — |

**Organization**

```ts
{
  id: string;
  name: string;
  slug: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}
```

Creating an org makes the current user `OWNER`.

---

## 8. Workspaces

Base: `/api/v1/workspaces` (Bearer)

| Method | Path | Body |
|--------|------|------|
| `POST` | `/` | `{ name, description?, organizationId }` |
| `GET` | `/` | Query pagination (memberships) |
| `GET` | `/:id` | — |
| `PATCH` | `/:id` | `{ name?, description? }` |
| `DELETE` | `/:id` | — |
| `GET` | `/:id/members` | — |
| `POST` | `/:id/members` | `{ email, role: 'ADMIN' \| 'MEMBER' }` |
| `PATCH` | `/:id/members/:userId` | `{ role: 'ADMIN' \| 'MEMBER' }` |
| `DELETE` | `/:id/members/:userId` | — |

**Workspace**

```ts
{
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}
```

**UI note:** Most product screens are workspace-scoped. After login → pick org → pick/create workspace → stash `workspaceId` in app state / URL.

---

## 9. Documents

(Bearer)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/workspaces/:workspaceId/documents` | `multipart/form-data`, field name **`file`** |
| `GET` | `/workspaces/:workspaceId/documents` | Paginated |
| `GET` | `/documents/:id` | Detail (+ versions/chunks metadata as returned) |
| `DELETE` | `/documents/:id` | — |

**Upload constraints**

- Max size: **20 MB**
- Allowed: PDF, DOCX, TXT, Markdown  
  MIME: `application/pdf`, Word DOCX MIME, `text/plain`, `text/markdown` (extension fallback `.pdf|.docx|.txt|.md`)

**Document**

```ts
{
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  errorMessage: string | null;
  metadata: unknown | null;
  organizationId: string;
  workspaceId: string;
  uploadedById: string;
  connectorId: string | null;
  externalId: string | null;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**UI:** show status badge; poll `GET /documents/:id` every few seconds while `PENDING`/`PROCESSING`; only chat/search reliably over `READY` docs.

---

## 10. Retrieval (search)

| Method | Path | Body |
|--------|------|------|
| `POST` | `/workspaces/:workspaceId/retrieval/search` | `{ query: string, topK?: number }` |

`topK` default `8`, range `1–20`.

**Response `data`:** `RetrievedChunk[]`

```ts
type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  pageNumber?: number | null;
  score: number;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown> | null; // may include isSummary
};
```

Useful for a “Sources” / debug search UI separate from chat.

---

## 11. Chat (SSE) — critical for React

### 11.1 Stream message

```http
POST /api/v1/workspaces/:workspaceId/chat
Authorization: Bearer <accessToken>
Content-Type: application/json
Accept: text/event-stream

{ "message": "What is our refund policy?", "conversationId": "<optional>" }
```

- Omit `conversationId` to start a **new** conversation.
- Pass it to continue a thread.

**Response:** `Content-Type: text/event-stream`  
Each event line: `data: <json>\n\n`

**Event union**

```ts
type ChatSseEvent =
  | {
      type: 'meta';
      conversationId: string;
      citations: ChatCitation[];
      memory: { hasSummary: boolean; recentTurns: number };
    }
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
```

```ts
type ChatCitation = {
  index: number;
  documentId: string;
  documentName: string;
  chunkId: string;
  pageNumber?: number | null;
  sourceUrl?: string | null;
};
```

**Order:** typically `meta` → many `token` → `done` (or `error`).

**React pattern (fetch streaming):**

```ts
async function streamChat(
  workspaceId: string,
  body: { message: string; conversationId?: string },
  accessToken: string,
  onEvent: (e: ChatSseEvent) => void,
) {
  const res = await fetch(
    `${API}/api/v1/workspaces/${workspaceId}/chat`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      onEvent(JSON.parse(line.slice(6)) as ChatSseEvent);
    }
  }
}
```

Do **not** use Axios default JSON parsing for this endpoint. Prefer `fetch` + `ReadableStream`, or an SSE-aware client.

### 11.2 Conversations

| Method | Path | `data` |
|--------|------|--------|
| `GET` | `/workspaces/:workspaceId/conversations` | Conversation list (own), last message + summary |
| `GET` | `/conversations/:id` | Full thread + messages + summary |
| `GET` | `/conversations/:id/memory` | Memory bundle |
| `DELETE` | `/conversations/:id` | `{ success: true }` |

**Message**

```ts
{
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  citations: ChatCitation[] | null;
  createdAt: string;
}
```

**Memory (`GET .../memory`)**

```ts
{
  conversationSummary: string | null;
  recentHistory: { role: 'user' | 'assistant'; content: string }[];
  totalMessages: number;
  summarizedThrough: number;
}
```

**Feedback:** only on **ASSISTANT** messages (see Feedback). After stream completes, reload conversation (or optimistically append) to get assistant `message.id` for thumbs up/down.

---

## 12. Feedback

| Method | Path | Body |
|--------|------|------|
| `POST` | `/messages/:messageId/feedback` | `{ rating: 'UP' \| 'DOWN', comment?: string }` |
| `GET` | `/workspaces/:workspaceId/feedback` | Last 100 feedback rows |

One feedback per `(messageId, userId)`; duplicate → `409`.

---

## 13. Connectors

| Method | Path | Body / notes |
|--------|------|----------------|
| `GET` | `/connectors/types` | `ConnectorType[]` |
| `POST` | `/workspaces/:workspaceId/connectors` | Create |
| `GET` | `/workspaces/:workspaceId/connectors` | List |
| `GET` | `/connectors/:id` | Detail |
| `PATCH` | `/connectors/:id` | `{ name?, config? }` |
| `DELETE` | `/connectors/:id` | `{ success: true }` |
| `POST` | `/connectors/:id/test` | `{ ok: boolean }` |
| `POST` | `/connectors/:id/sync` | `{ jobId, connectorId, status: 'queued' }` |

**Types**

```ts
type ConnectorType =
  | 'GOOGLE_DRIVE'
  | 'GITHUB'
  | 'NOTION'
  | 'CONFLUENCE'
  | 'JIRA'
  | 'SLACK'
  | 'SHAREPOINT'
  | 'POSTGRESQL';

type ConnectorStatus =
  | 'DISCONNECTED'
  | 'CONNECTED'
  | 'SYNCING'
  | 'ERROR';
```

**Create**

```ts
{
  name: string; // min 2
  type: ConnectorType;
  config?: Record<string, unknown>; // non-secret; secrets later
}
```

Drivers are currently **stubs**. UI can still list types, create, test, and enqueue sync; treat sync as async and poll connector `status` / documents.

---

## 14. Knowledge summaries

| Method | Path | `data` |
|--------|------|--------|
| `GET` | `/workspaces/:workspaceId/summaries` | Summary list |
| `POST` | `/workspaces/:workspaceId/summaries/refresh` | `{ status: 'queued', kind: 'WORKSPACE', workspaceId }` |
| `POST` | `/connectors/:id/summaries/refresh` | `{ status: 'queued', kind: 'CONNECTOR', connectorId }` |
| `POST` | `/documents/:id/summaries/refresh` | `{ status: 'queued', kind: 'DOCUMENT', documentId }` |

List item:

```ts
{
  id: string;
  kind: 'DOCUMENT' | 'WORKSPACE' | 'CONNECTOR';
  title: string;
  summary: string;
  documentId: string | null;
  connectorId: string | null;
  updatedAt: string;
}
```

---

## 15. Admin / analytics / evaluation (`SUPER_ADMIN` only)

These return `403` for normal `USER` accounts.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/admin/dashboard` | Platform metrics |
| `GET` | `/analytics/costs?organizationId=` | Optional org filter; last ~30 days |
| `POST` | `/evaluation/runs` | `{ workspaceId, topK? }` |
| `GET` | `/evaluation/runs` | Recent runs |

**Dashboard `data` (shape)**

```ts
{
  totalUsers: number;
  activeUsers: number; // last 24h login
  organizations: number;
  workspaces: number;
  documents: number;
  indexedChunks: number;
  queries24h: number;
  averageLatencyMs: number;
  connectorHealth: {
    byStatus: Record<string, number>;
    failedJobs: number;
  };
  redisOk: boolean;
  costs: CostSummary;
}
```

**CostSummary**

```ts
{
  monthlyCost: number;
  tokenUsage: number;
  dailyCost: Record<string, number>; // YYYY-MM-DD → usd
  costPerOrganization: Record<string, number>;
  costPerUser: Record<string, number>;
  costPerModel: Record<string, number>;
}
```

**Eval run response**

```ts
{
  runId: string;
  metrics: {
    recallAtK: number;
    precisionAtK: number;
    mrr: number;
    citationAccuracy: number;
    answerRelevance: number;
    faithfulness: number;
    averageLatencyMs: number;
    tokenCost: number;
    topK: number;
    cases: number;
  };
  details: object[];
}
```

Gate admin routes in React with `user.role === 'SUPER_ADMIN'`.

---

## 16. Health

No `/api/v1` prefix. Public.

| Method | Path | Meaning |
|--------|------|---------|
| `GET` | `/health/live` | Process up |
| `GET` | `/health` / `/health/ready` | DB + Redis ready |

Ready success:

```ts
{
  status: 'ready';
  checks: { database: 'up' | 'down'; redis: 'up' | 'down' };
  timestamp: string;
}
```

If degraded → HTTP `503` with error envelope / payload containing checks.

---

## 17. HTTP status cheat sheet

| Code | Meaning |
|------|---------|
| `200` / `201` | OK (Nest may use 200 for creates) |
| `400` | Validation / bad upload |
| `401` | Missing/invalid JWT or refresh |
| `403` | Role / membership forbidden |
| `404` | Not found (or hidden as not found) |
| `409` | Conflict (duplicate feedback, etc.) |
| `429` | Rate limited |
| `500` / `503` | Server / dependency |

Validation errors often return `message` as **string array**.

---

## 18. Suggested React app structure

Map screens to APIs:

| Screen | APIs |
|--------|------|
| Login / Register | `POST /auth/login`, `/auth/register` |
| App shell / me | `GET /auth/me` or `/users/me` |
| Org switcher | `GET/POST /organizations` |
| Org settings / members | org CRUD + members |
| Workspace switcher | `GET/POST /workspaces` |
| Workspace settings | workspace CRUD + members |
| Knowledge / Documents | documents upload/list + status poll |
| Connectors | types, CRUD, test, sync |
| Summaries | list + refresh |
| Chat | SSE chat + conversations + feedback |
| Search (optional) | retrieval search |
| Admin | dashboard, costs, evaluation |

**URL suggestion**

```
/login
/orgs
/orgs/:orgId/workspaces
/w/:workspaceId/chat
/w/:workspaceId/chat/:conversationId
/w/:workspaceId/documents
/w/:workspaceId/connectors
/w/:workspaceId/summaries
/admin
```

---

## 19. Shared TypeScript types (copy into frontend)

```ts
export type ApiSuccess<T> = { success: true; data: T };
export type ApiError = {
  success: false;
  statusCode: number;
  path: string;
  timestamp: string;
  message: string | string[];
};

export type UserRole = 'SUPER_ADMIN' | 'USER';
export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type WorkspaceRole = 'ADMIN' | 'MEMBER';
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';
export type FeedbackRating = 'UP' | 'DOWN';
export type ConnectorType =
  | 'GOOGLE_DRIVE'
  | 'GITHUB'
  | 'NOTION'
  | 'CONFLUENCE'
  | 'JIRA'
  | 'SLACK'
  | 'SHAREPOINT'
  | 'POSTGRESQL';
export type ConnectorStatus =
  | 'DISCONNECTED'
  | 'CONNECTED'
  | 'SYNCING'
  | 'ERROR';
export type KnowledgeSummaryKind = 'DOCUMENT' | 'WORKSPACE' | 'CONNECTOR';

export type Paginated<T> = {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

export type AuthTokens = { accessToken: string; refreshToken: string };
```

---

## 20. Client checklist

1. Base URL + `/api/v1` for app APIs; health without prefix.
2. Unwrap `{ success, data }`; surface `message` on errors.
3. JWT access + refresh-on-401.
4. Keep `workspaceId` (and usually `organizationId`) in route/state.
5. Multipart upload field name = `file`.
6. Chat = SSE event parser (`meta` / `token` / `done` / `error`).
7. Poll document (and connector) async jobs.
8. Hide admin UI unless `SUPER_ADMIN`.
9. Optional: forward `x-correlation-id`.
10. Live OpenAPI: open `/docs` while backend is running for interactive exploration.

---

## 21. Current backend limitations (affects UI copy)

- AI answers, embeddings, and connector sync are **stubs** until real providers are wired.
- Chat still streams tokens and returns citations; treat quality as placeholder.
- File storage is local backend disk (not S3 CDN URLs).
- No websocket channel — chat is one-shot HTTP SSE per message.

When stubs are replaced, API shapes above should stay stable; only answer quality and connector behavior change.

---

*Generated from Memora NestJS backend (`api/v1`). Prefer code + Swagger if this doc and implementation diverge.*
