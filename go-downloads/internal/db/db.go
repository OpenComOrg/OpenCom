package db

import (
	"database/sql"

	"downloads/internal/config"

	_ "github.com/go-sql-driver/mysql"
)

func Open(cfg config.Config) (*sql.DB, error) {
	db, err := sql.Open("mysql", cfg.DSN())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)
	return db, nil
}
