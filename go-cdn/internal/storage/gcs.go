package storage

import (
	"context"
	"errors"
	"io"
	"strings"

	cloudstorage "cloud.google.com/go/storage"
	"google.golang.org/api/googleapi"
)

var (
	ErrBucketForbidden = errors.New("bucket is not allowed")
	ErrInvalidBucket   = errors.New("bucket is required")
	ErrInvalidPath     = errors.New("path is required")
	ErrObjectNotFound  = errors.New("object not found")
)

type GCSClient struct {
	client *cloudstorage.Client
}

type UploadInput struct {
	Bucket      string
	Path        string
	ContentType string
	Reader      io.Reader
}

type ObjectAttributes struct {
	ContentType  string
	CacheControl string
	Size         int64
}

func NewGCSClient() (*GCSClient, error) {
	client, err := cloudstorage.NewClient(context.Background())
	if err != nil {
		return nil, err
	}

	return &GCSClient{client: client}, nil
}

func (g *GCSClient) Open(ctx context.Context, bucket, objectPath string) (io.ReadCloser, ObjectAttributes, error) {
	if strings.TrimSpace(bucket) == "" {
		return nil, ObjectAttributes{}, ErrInvalidBucket
	}
	if strings.TrimSpace(objectPath) == "" {
		return nil, ObjectAttributes{}, ErrInvalidPath
	}

	object := g.client.Bucket(bucket).Object(objectPath)
	reader, err := object.NewReader(ctx)
	if err != nil {
		return nil, ObjectAttributes{}, normalizeError(err)
	}

	attrs := reader.Attrs
	return reader, ObjectAttributes{
		ContentType:  attrs.ContentType,
		CacheControl: attrs.CacheControl,
		Size:         attrs.Size,
	}, nil
}

func (g *GCSClient) Upload(ctx context.Context, input UploadInput) error {
	if strings.TrimSpace(input.Bucket) == "" {
		return ErrInvalidBucket
	}
	if strings.TrimSpace(input.Path) == "" {
		return ErrInvalidPath
	}

	writer := g.client.Bucket(input.Bucket).Object(input.Path).NewWriter(ctx)
	writer.ContentType = input.ContentType

	if _, err := io.Copy(writer, input.Reader); err != nil {
		_ = writer.Close()
		return normalizeError(err)
	}

	if err := writer.Close(); err != nil {
		return normalizeError(err)
	}

	return nil
}

func normalizeError(err error) error {
	if errors.Is(err, cloudstorage.ErrObjectNotExist) {
		return ErrObjectNotFound
	}

	var apiErr *googleapi.Error
	if errors.As(err, &apiErr) && apiErr.Code == 404 {
		return ErrObjectNotFound
	}

	return err
}
