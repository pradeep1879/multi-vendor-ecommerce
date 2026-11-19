# Marketplace backend

Express + TypeScript API running on Bun. Install independently with `bun install`; copy `.env.example` to `.env` to override local settings.

```sh
bun run dev       # watch mode, port 3000 by default
bun run start     # production-mode server
bun run build
bun run lint
bun run typecheck
bun test
```

The server requires PostgreSQL configuration. Copy `.env.example` to `.env`, then update `DATABASE_URL` and `JWT_ACCESS_SECRET` (at least 32 characters) before starting it. `GET /health` is liveness; `GET /health/ready` checks PostgreSQL. `GET /api/v1` reports the API version. `openapi.yaml` is the maintained OpenAPI specification. `PORT` must be an integer from 1 through 65535. `NODE_ENV` accepts `development`, `test`, or `production`. `CORS_ORIGINS` is a comma-separated list of allowed HTTP(S) origins. JSON body size, global and authentication rate limits, and token lifetimes are configurable in `.env`.

Authentication is mounted at `/api/v1/auth`. Refresh tokens are held in an HttpOnly, SameSite cookie; refresh and logout require an allowed `Origin`. Access tokens are returned to the caller and should be kept in memory by clients. The default email sender is intentionally unconfigured and never logs reset or verification tokens; configure an `EmailSender` adapter before expecting delivery outside tests.

Database commands (run with `DATABASE_URL` set):

```sh
bun run db:validate
bun run db:generate
bun run db:migrate -- --name descriptive_change
bun run db:deploy
bun run db:seed  # requires local-only DEV_SEED_PASSWORD
```
