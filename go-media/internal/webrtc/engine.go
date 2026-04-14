package webrtc

import (
	"media/internal/config"

	"github.com/pion/interceptor"
	pion "github.com/pion/webrtc/v4"
)

type Engine struct {
	cfg config.Config
	api *pion.API
}

func NewEngine(cfg config.Config) (Engine, error) {
	mediaEngine := &pion.MediaEngine{}
	if err := mediaEngine.RegisterDefaultCodecs(); err != nil {
		return Engine{}, err
	}

	interceptors := &interceptor.Registry{}
	if err := pion.RegisterDefaultInterceptors(mediaEngine, interceptors); err != nil {
		return Engine{}, err
	}

	settingEngine := pion.SettingEngine{}
	if cfg.WebRTCPublicHost != "" {
		settingEngine.SetNAT1To1IPs([]string{cfg.WebRTCPublicHost}, pion.ICECandidateTypeHost)
	}

	api := pion.NewAPI(
		pion.WithMediaEngine(mediaEngine),
		pion.WithInterceptorRegistry(interceptors),
		pion.WithSettingEngine(settingEngine),
	)

	return Engine{
		cfg: cfg,
		api: api,
	}, nil
}

func (e Engine) NewPeerConnection() (*pion.PeerConnection, error) {
	return e.api.NewPeerConnection(pion.Configuration{})
}

func (e Engine) Diagnostics() map[string]any {
	return map[string]any{
		"engine":      "pion",
		"publicHost":  e.cfg.WebRTCPublicHost,
		"udpMinPort":  e.cfg.WebRTCUDPMinPort,
		"udpMaxPort":  e.cfg.WebRTCUDPMaxPort,
		"implemented": true,
		"mode":        "server-answer-sfu-relay",
	}
}
