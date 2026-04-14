FROM golang:1.25-bookworm AS build

WORKDIR /src/go-cdn

COPY go-cdn/go.mod go-cdn/go.sum ./
RUN go mod download

COPY go-cdn/ ./

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/go-cdn ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=build /out/go-cdn /app/go-cdn

ENV PORT=8000

EXPOSE 8000

ENTRYPOINT ["/app/go-cdn"]
