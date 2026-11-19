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

Local development uses `VITE_API_URL=/api/v1`, which Vite proxies to `VITE_DEV_API_URL` (`http://localhost:3000` by default). Production builds use `frontend/.env.production` and point to the deployed API. Set or override `VITE_API_URL` in Vercel Project Settings → Environment Variables if the API URL changes; Vite embeds this public value at build time, so redeploy after changing it. The backend's `FRONTEND_URL` must be set to the deployed frontend origin for its exact CORS and trusted-origin checks. `VITE_GOOGLE_CLIENT_ID` is the public OAuth client ID; never put provider secrets in this application.
