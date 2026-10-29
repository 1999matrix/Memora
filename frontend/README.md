# Memora frontend

React + Vite UI for **backend-v2** (`../backend-v2/api`).

## Dev

1. Start Postgres, Redis, API (port **7000**), and worker — see [backend-v2 README](../backend-v2/README.md).
2. Copy `.env.example` to `.env` (`VITE_API_BASE_URL=http://localhost:7000`).
3. Run:

```bash
npm install
npm run dev
```

App: `http://localhost:5173`. Vite proxies `/api`, `/health`, and `/docs` to the API.

## Stack

- React 19, React Router, TanStack Query, Axios, Tailwind 4
