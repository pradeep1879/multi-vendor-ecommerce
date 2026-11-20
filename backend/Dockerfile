FROM oven/bun:1.3.0-alpine AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN bunx prisma generate
COPY src ./src
RUN bun run build

FROM oven/bun:1.3.0-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/prisma ./prisma
COPY --from=build --chown=bun:bun /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=bun:bun /app/src/prisma-client ./src/prisma-client
COPY --from=build --chown=bun:bun /app/dist ./dist
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "run", "dist/server.js"]
