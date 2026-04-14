package protocol

type GatewayEnvelope struct {
	Op string `json:"op"`
	D  any    `json:"d,omitempty"`
	S  int    `json:"s,omitempty"`
	T  string `json:"t,omitempty"`
}

type MediaIdentify struct {
	MediaToken string `json:"mediaToken"`
}
