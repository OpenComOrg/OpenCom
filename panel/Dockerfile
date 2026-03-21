FROM node:22-bookworm-slim

WORKDIR /app/panel

COPY package.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PANEL_INTERNAL_PORT=5175

EXPOSE 5175

CMD ["sh", "-lc", "npm run build && npm run preview -- --host 0.0.0.0 --port ${PANEL_INTERNAL_PORT:-5175}"]
