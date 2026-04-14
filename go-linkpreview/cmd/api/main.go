package main

import (
	"log"

	"linkpreview/internal/config"
	httpserver "linkpreview/internal/http"
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

	log.Printf("go-linkpreview server running on %s", cfg.BindAddress())
	if err := router.Run(cfg.BindAddress()); err != nil {
		log.Fatal(err)
	}
}
