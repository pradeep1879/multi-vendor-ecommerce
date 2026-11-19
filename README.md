# Multi-Vendor Marketplace

Multi-vendor marketplace implemented as independently managed React + TypeScript and Express + TypeScript applications. The backend runs on Bun and uses PostgreSQL with Prisma.

## Prerequisites

- Bun 1.3 or newer
- PostgreSQL 16 or newer
- A modern browser

The customer storefront runs at `http://localhost:5173` and the backend at `http://localhost:3000` by default. Role protected admin and vendor workspaces are available at `/admin` and `/vendor`.

## Install

Create a local database and configure the backend first:

```sh
createdb marketplace
cp backend/.env.example backend/.env
# Edit backend/.env: set DATABASE_URL for your PostgreSQL user, JWT_ACCESS_SECRET (32+ characters), and a local-only DEV_SEED_PASSWORD.
```

Install each application independently and apply the checked-in database migrations:

```sh
cd backend
bun install
bun run db:deploy
cd ../frontend
bun install
```

Copy each `.env.example` to `.env` when you need to override local defaults. The frontend example contains only browser-safe API and Google client configuration. Keep database, JWT, Google audience, S3 and payment credentials in `backend/.env`; never expose backend credentials through frontend variables.

## Develop

Run each app in a separate terminal:

```sh
cd backend && bun run dev
cd frontend && bun run dev
```

The backend serves `GET /health` for liveness and `GET /health/ready` for PostgreSQL readiness. To load deterministic development accounts and sample catalog data, run `cd backend && bun run db:seed` with the local-only `DEV_SEED_PASSWORD` set. Optional `DEV_SEED_ADMIN_PASSWORD`, `DEV_SEED_VENDOR_ONE_PASSWORD`, `DEV_SEED_VENDOR_TWO_PASSWORD`, and `DEV_SEED_CUSTOMER_PASSWORD` values assign separate passwords; each must be at least 12 characters. If omitted, each account uses `DEV_SEED_PASSWORD`. Seeded login emails are `admin@example.test`, `vendor-one@example.test`, `vendor-two@example.test`, and `customer@example.test`; the seed command prints which password variable applies to each account. Seeding is disabled when `NODE_ENV=production`.

## Verify and build

From either application directory, available scripts are:

```sh
bun run lint
bun run typecheck
bun test
bun run build
```

`bun run start` starts the production server for that application. Frontend and backend dependencies, lockfiles, environment configuration, and scripts remain independent.

Backend schema commands include `bun run db:validate`, `bun run db:generate`, `bun run db:migrate -- --name descriptive_change`, and `bun run db:status`. Database integration tests require an isolated database name ending in `_test`, with migrations applied; set both `DATABASE_URL` and `DIRECT_URL` to that test database as well as `TEST_DATABASE_URL` before running `bun test`. Never run reset commands against shared or production databases. See `docs/production-migration.md` for the merger backfill runbook.

## Configuration

Backend settings include `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, token lifetimes, `CORS_ORIGINS`, `JSON_BODY_LIMIT`, and global/authentication rate limits. Invalid values produce a clear startup error. The backend API contract is maintained in `backend/openapi.yaml`. The Vite frontend reads `VITE_API_URL`, `VITE_DEV_API_URL`, `VITE_GOOGLE_CLIENT_ID`, and `VITE_LOCAL_ORIGIN`; only the Google client ID is intended for browser exposure.

## Merged integrations

- **Customer UI:** Maison Beauté customer routes start at `/`. Admins use `/admin`; approved vendors use `/vendor`. Both workspaces share a dashboard visual system and expose actions supported by the role's API.
- **Google sign-in:** set `GOOGLE_CLIENT_ID` in the backend and the matching public `VITE_GOOGLE_CLIENT_ID` in the frontend. The backend verifies Google ID tokens and grants new accounts the customer role. No OAuth client secret is used by this ID-token flow.
- **S3 images:** set the `S3_*` backend variables in `backend/.env` to enable authorized presigned upload, completion, replacement and deletion. The browser receives only presigned URLs and public image URLs.
- **Razorpay:** use the target backend variables `PAYMENT_PROVIDER=razorpay`, `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET` and `PAYMENT_WEBHOOK_SECRET`. Configure the provider webhook URL as `https://<public-api-host>/api/v1/payments/webhook` and subscribe to payment captured/failed and refund processed/failed events supported by the account. Keep credentials server-side.
- **Email delivery:** password reset and email verification use the backend Resend adapter. Set `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `FRONTEND_URL` in the backend environment. In local development, `AUTH_EMAIL_DELIVERY=console` explicitly logs one-time links to the development console. No provider credentials are configured in this checkout.
- **Testing:** Google, Razorpay live/test dashboard callbacks and real S3 object operations require external credentials. Local fixture and mocked-provider coverage is documented separately and must not be treated as provider verification.
