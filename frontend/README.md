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

Local development uses `VITE_API_URL=/api/v1`, which Vite proxies to `VITE_DEV_API_URL` (`http://localhost:3000` by default). Production sets `VITE_API_SAME_ORIGIN=true`; `frontend/vercel.json` proxies `/api/v1` to the deployed backend, keeping the refresh cookie on the frontend origin so it works across page reloads and browser privacy settings. The backend's `FRONTEND_URL` must be set to the deployed frontend origin for its exact CORS and trusted-origin checks. `VITE_GOOGLE_CLIENT_ID` is the public OAuth client ID; never put provider secrets in this application.
