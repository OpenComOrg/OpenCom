package service

import (
	"database/sql"

	"downloads/internal/config"
)

type Service struct {
	cfg config.Config
	db  *sql.DB
}

func New(cfg config.Config, db *sql.DB) Service {
	return Service{cfg: cfg, db: db}
}
