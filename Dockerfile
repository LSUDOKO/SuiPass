FROM oven/bun:1 AS base
WORKDIR /app

# Root workspace files
COPY package.json bun.lock ./

# Workspace package.json files (needed for bun install to resolve workspaces)
COPY packages/engine/package.json packages/engine/package.json
COPY packages/server/package.json packages/server/package.json

# Install all dependencies
RUN bun install

# Copy TypeScript configs
COPY tsconfig.json tsconfig.json
COPY packages/engine/tsconfig.json packages/engine/tsconfig.json
COPY packages/server/tsconfig.json packages/server/tsconfig.json

# Copy source code
COPY packages/engine/src packages/engine/src
COPY packages/server/src packages/server/src

# Railway injects PORT via env vars
ENV PORT=4070
EXPOSE 4070

# Hono/Bun server — Bun runs TypeScript natively
CMD ["bun", "run", "--cwd", "packages/server", "src/index.ts"]
