package main

import (
	"log"

	"themes/internal/config"
	httpserver "themes/internal/http"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	router, err := httpserver.New(cfg)
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("go-themes server running on %s", cfg.BindAddress())
	if err := router.Run(cfg.BindAddress()); err != nil {
		log.Fatal(err)
	}
}
