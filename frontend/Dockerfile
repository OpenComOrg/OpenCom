FROM node:22-bookworm-slim

WORKDIR /app/frontend

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV FRONTEND_INTERNAL_PORT=5173

EXPOSE 5173

# Build using env vars loaded by docker-compose env_file, then serve on preview server.
CMD ["sh", "-lc", "npm run build && npm run preview -- --host 0.0.0.0 --port ${FRONTEND_INTERNAL_PORT:-5173}"]
