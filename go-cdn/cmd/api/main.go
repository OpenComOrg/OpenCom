package main

import (
	"log"

	"cdn/internal/config"
	httpserver "cdn/internal/http"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	r, err := httpserver.New(cfg)
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("server running on %s", cfg.BindAddress())
	if err := r.Run(cfg.BindAddress()); err != nil {
		log.Fatal(err)
	}
}
