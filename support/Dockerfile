FROM node:22-bookworm-slim

WORKDIR /app/support

COPY . .

ENV SUPPORT_PORT=5174
ENV SUPPORT_HOST=0.0.0.0

EXPOSE 5174

CMD ["node", "server.mjs"]
