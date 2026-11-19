# Marketplace frontend

The customer storefront runs on Vite at `http://localhost:5173`; the preserved multi-vendor customer, admin and vendor workspace is available at `/marketplace`. Install independently with `bun install`.

```sh
bun run dev       # Vite development server
bun run start     # preview the production build
bun run build
bun run lint
bun run typecheck
bun test
```

`VITE_API_URL` defaults to `/api/v1`, which Vite proxies to the backend at `VITE_DEV_API_URL` (default `http://localhost:3000`). `VITE_GOOGLE_CLIENT_ID` is the public OAuth client ID; never put provider secrets in this application. Keep production values aligned with the deployed API and browser origin.
