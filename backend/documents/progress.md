# Progress

- Switched Nest compile from `tsc` to SWC. A full compile dropped from about 30s to under 1s. `tsc` was typechecking the generated Prisma client on every start.
- Added `npm run typecheck` for a full TypeScript check. `nest build` / `start:dev` no longer wait on it.
- Installed missing `@nestjs/bullmq` and `bullmq`.
- Added `.env` from `.env.example`. Database URL now matches docker-compose (`postgres` / `postgres`).
- Production entry is `dist/main.js` in `package.json`, the Dockerfile, and docker-compose.
- Postgres pool fails a connection attempt after 5 seconds instead of waiting with no timeout.
- In development, BullMQ does not keep reconnecting when Redis is down, so the process can finish booting and the log stays readable.
- Verified `GET /health/live` returns 200 without Postgres or Redis. Unit tests: 13 passed.
