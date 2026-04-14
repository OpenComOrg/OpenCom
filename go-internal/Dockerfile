FROM golang:1.25-bookworm AS build

WORKDIR /src/go-internal

COPY go-internal/go.mod go-internal/go.sum ./
RUN go mod download

COPY go-internal/ ./

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/go-internal ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=build /out/go-internal /app/go-internal
COPY client/package.json /app/client/package.json
COPY frontend/public/downloads /app/frontend/public/downloads

ENV PORT=3015
ENV REPO_ROOT=/app
ENV DOWNLOADS_STORAGE_DIR=/app/frontend/public/downloads

EXPOSE 3015

ENTRYPOINT ["/app/go-internal"]
