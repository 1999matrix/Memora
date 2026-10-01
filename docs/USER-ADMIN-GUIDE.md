# Memora — User & Admin Guide (brief)

Quick reference for day-to-day use and local setup. Deeper technical notes: `backend/docs/ai-integration.md`, `backend/docs/connectors.md`.

---

## 1. What Memora does

Memora indexes **documents** and **integrations** into a workspace knowledge base. You **chat** or **search** with answers grounded in retrieved chunks and **citations**. Indexing and connector sync run in the **background** (Redis + BullMQ).

---

## 2. Getting started (first login)

1. Open the app (frontend). Register or sign in.
2. Go to **Organizations** → pick or create an org → open a **workspace**.
3. Inside a workspace you land on **Chat**. Use the sidebar:
   - **Chat** — ask questions (streaming answers + citations).
   - **Documents** — upload PDF, DOCX, TXT, Markdown (max 20MB).
   - **Integrations** — connect Drive, OneDrive/SharePoint, GitHub, etc.
   - **Summaries** — workspace/document/connector rollups.
   - **Search** — retrieval without chat.
   - **Settings** — workspace options (members need appropriate role).

Wait until uploaded documents show status **READY** before expecting good chat results.

---

## 3. Everyday user

| Task | Where | Notes |
|------|--------|--------|
| Ask a question | Chat | New thread or continue an existing conversation. |
| See sources | Chat | Citations appear with the reply; use them to verify claims. |
| Upload a file | Documents | Processing is async; status goes PENDING → PROCESSING → READY. |
| Find a passage | Search | Same index as chat retrieval. |
| Profile | Sidebar → your avatar | Account details. |

You need to be a **member** of the workspace to use it.

---

## 4. Workspace admin

Workspace **ADMIN** (and org admins, per your membership) can:

| Task | Where | Notes |
|------|--------|--------|
| Add an integration | Integrations → pick card → **Connect** | JSON config in the side panel. |
| Try without API keys | Integrations → **Use demo mode** | `{ "mode": "demo" }` — stub sync for testing the flow. |
| Test / sync | Active connections | **Test** checks the driver; **Sync** queues indexing. |
| Remove integration | Active connections → **Remove** | Deletes connector record (and linked sync behavior per backend). |
| Re-embed after enabling OpenAI | API or re-upload | See §6 — old stub vectors must be reprocessed. |

**Integration config (live):** each type needs tokens/IDs in JSON (no OAuth UI yet). Examples:

- **Google Drive** — `accessToken`, `folderId`
- **OneDrive & SharePoint** — `accessToken`, `siteId`, `driveId`, optional `folderPath`
- **GitHub** — `token`, `owner`, `repo`
- **PostgreSQL** — `connectionString`, `sql` (+ optional column names)

Full field list: `backend/docs/connectors.md`.

---

## 5. Platform admin (`SUPER_ADMIN`)

1. Sign in as a user with platform role **SUPER_ADMIN**.
2. Open **Platform** in the sidebar (or `/admin`).

| Area | Purpose |
|------|---------|
| Dashboard | User/org counts, cost summary, connector health |
| Evaluation | Run golden-set eval against a workspace ID; view past runs |

Eval uses retrieval + LLM-as-judge when OpenAI is enabled; heuristics when stub AI is active.

---

## 6. Enabling real AI (operators)

In `backend/.env`:

```env
AI_PROVIDER=auto          # uses OpenAI when OPENAI_API_KEY is set
OPENAI_API_KEY=sk-...     # required for real chat + embeddings
```

1. Set the key; restart **API** and **worker** (same codebase — both must run for uploads/sync).
2. **Re-index**: re-upload documents or `POST /documents/:id/reprocess` (Swagger or API client).
3. Chat again in a workspace that has **READY** documents.

| `AI_PROVIDER` | Behavior |
|---------------|----------|
| `auto` | OpenAI if key present, else stub (no API cost) |
| `stub` | Always fake embeddings/answers |
| `openai` | Always OpenAI; key required at startup |

Details: `backend/docs/ai-integration.md`.

---

## 7. Local stack (developers / admins)

**Dependencies:** PostgreSQL, Redis, Node backend, frontend.

| Service | Typical |
|---------|---------|
| API | `backend` → `npm run start:dev` (port from `.env`, e.g. 7000) |
| Worker | Same app process hosts BullMQ workers when Redis is up |
| Frontend | `frontend` → `npm run dev`; `VITE_API_BASE_URL` → API |
| DB | `DATABASE_URL` in `backend/.env` |
| Docker | `backend/docker-compose.yml` — Postgres + Redis + backend + worker |

Health: `GET /health/live` (no DB required). Swagger: API base URL + `/api` (if enabled in your build).

---

## 8. Roles (short)

| Level | Roles | Typical powers |
|-------|--------|----------------|
| Platform | `SUPER_ADMIN` | `/admin`, cross-tenant metrics |
| Organization | org membership roles | Org settings, billing hooks (as implemented) |
| Workspace | `ADMIN`, `MEMBER`, … | Admins: integrations, destructive actions; members: chat, upload (as allowed) |

Exact enums are enforced by the API; the UI hides **Platform** unless you are `SUPER_ADMIN`.

---

## 9. Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Chat answers are generic / “stub” | No `OPENAI_API_KEY` or `AI_PROVIDER=stub` |
| Chat ignores your docs | Document not **READY**; or embeddings from stub era — reprocess |
| Sync does nothing useful | Demo mode or missing integration credentials |
| Upload stuck | Redis down or worker not running |
| Integration test fails | Check JSON config and token scopes |

---

## 10. Related docs

| Doc | Content |
|-----|---------|
| `backend/docs/ai-integration.md` | AI providers, models, re-embed |
| `backend/docs/connectors.md` | Per-connector config |
| `backend/documents/progress.md` | Engineering progress log |
