FROM golang:1.25-bookworm AS build

WORKDIR /src/go-media

COPY go-media/go.mod go-media/go.sum ./
RUN go mod download

COPY go-media/ ./

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o /out/go-media ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=build /out/go-media /app/go-media

ENV PORT=3003
ENV MEDIA_HOST=0.0.0.0

EXPOSE 3003

ENTRYPOINT ["/app/go-media"]
