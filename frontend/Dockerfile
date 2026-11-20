FROM oven/bun:1.3.0-alpine AS build
WORKDIR /app
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.0-alpine AS runtime
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/src ./src
COPY --from=build --chown=bun:bun /app/dist ./dist
USER bun
EXPOSE 3001
CMD ["bun", "run", "start", "--port", "3001"]
