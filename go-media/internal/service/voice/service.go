package voice

import (
	"errors"
	"io"
	"sync"
	"time"

	"media/internal/auth"
	"media/internal/config"
	"media/internal/protocol"
	appwebrtc "media/internal/webrtc"

	pion "github.com/pion/webrtc/v4"
)

type Conn interface {
	Send(protocol.GatewayEnvelope) error
	Close() error
}

type Session struct {
	ID        string
	UserID    string
	GuildID   string
	ChannelID string
	JoinedAt  time.Time
	Speaking  bool
}

type connectionState struct {
	id       string
	conn     Conn
	userID   string
	guilds   map[string]struct{}
	channels map[string]struct{}
	scope    auth.MediaTokenClaims
	voice    *Session
	seq      int
	peer     *peerState
}

type peerState struct {
	connState       *connectionState
	pc              *pion.PeerConnection
	roomKey         string
	pendingOffer    bool
	pendingICE      []pion.ICECandidateInit
	senders         map[string]*pion.RTPSender
	producers       map[string]*producerState
	metadataByTrack map[string]trackMetadata
	mu              sync.Mutex
	closed          bool
}

type roomState struct {
	guildID   string
	channelID string
	sessions  map[string]*connectionState
	producers map[string]*producerState
}

type producerState struct {
	id         string
	trackID    string
	kind       string
	source     string
	userID     string
	ownerConnID string
	localTrack *pion.TrackLocalStaticRTP
}

type trackMetadata struct {
	TrackID string
	Kind    string
	Source  string
}

type Service struct {
	cfg         config.Config
	engine      appwebrtc.Engine
	mu          sync.RWMutex
	connections map[string]*connectionState
	rooms       map[string]*roomState
}

func New(cfg config.Config, engine appwebrtc.Engine) *Service {
	return &Service{
		cfg:         cfg,
		engine:      engine,
		connections: make(map[string]*connectionState),
		rooms:       make(map[string]*roomState),
	}
}

func (s *Service) Diagnostics() map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()

	roomCount := len(s.rooms)
	connCount := len(s.connections)
	sessionCount := 0
	producerCount := 0
	for _, room := range s.rooms {
		sessionCount += len(room.sessions)
		producerCount += len(room.producers)
	}

	return map[string]any{
		"connections": connCount,
		"rooms":       roomCount,
		"sessions":    sessionCount,
		"producers":   producerCount,
		"engine":      s.engine.Diagnostics(),
		"deployment":  s.cfg.Diagnostics(),
	}
}

func (s *Service) HandleIdentify(connID string, conn Conn, claims auth.MediaTokenClaims, _ string) protocol.GatewayEnvelope {
	s.mu.Lock()
	defer s.mu.Unlock()

	state := &connectionState{
		id:       connID,
		conn:     conn,
		userID:   claims.Sub,
		guilds:   make(map[string]struct{}),
		channels: make(map[string]struct{}),
		scope:    claims,
	}
	s.connections[connID] = state

	return protocol.GatewayEnvelope{
		Op: "READY",
		D: map[string]any{
			"user": map[string]any{
				"id":       claims.Sub,
				"username": "unknown",
			},
			"guildId":   claims.GuildID,
			"channelId": claims.ChannelID,
			"roomId":    claims.RoomID,
		},
	}
}

func (s *Service) RemoveConnection(connID string) {
	s.mu.Lock()
	state := s.connections[connID]
	if state == nil {
		s.mu.Unlock()
		return
	}
	delete(s.connections, connID)
	roomPeers := s.removeConnectionVoiceLocked(state, "SOCKET_CLOSED")
	s.mu.Unlock()

	for _, peer := range roomPeers {
		s.requestRenegotiation(peer, "peer-left")
	}
}

func (s *Service) HandleEnvelope(connID string, envelope protocol.GatewayEnvelope) []protocol.GatewayEnvelope {
	s.mu.Lock()
	state := s.connections[connID]
	if state == nil {
		s.mu.Unlock()
		return nil
	}

	switch envelope.Op {
	case "HEARTBEAT":
		s.mu.Unlock()
		return []protocol.GatewayEnvelope{{Op: "HEARTBEAT_ACK"}}
	case "DISPATCH":
		responses, async := s.handleDispatchLocked(state, envelope)
		s.mu.Unlock()
		for _, peer := range async {
			s.requestRenegotiation(peer, "room-update")
		}
		return responses
	default:
		s.mu.Unlock()
		return nil
	}
}

func (s *Service) ForceDisconnectMember(guildID, channelID, userID string) int {
	s.mu.Lock()
	peers := make([]*peerState, 0)
	disconnected := 0
	for _, state := range s.connections {
		if state.userID != userID || state.voice == nil {
			continue
		}
		if state.voice.GuildID != guildID || state.voice.ChannelID != channelID {
			continue
		}
		s.sendDispatchLocked(state, "VOICE_LEFT", map[string]any{
			"ok":        true,
			"guildId":   guildID,
			"channelId": channelID,
			"reason":    "SERVER_DISCONNECT",
		})
		peers = append(peers, s.removeConnectionVoiceLocked(state, "SERVER_DISCONNECT")...)
		disconnected++
	}
	s.mu.Unlock()

	for _, peer := range peers {
		s.requestRenegotiation(peer, "force-disconnect")
	}
	return disconnected
}

func (s *Service) CloseRoom(guildID, channelID string) int {
	s.mu.Lock()
	peers := make([]*peerState, 0)
	disconnected := 0
	for _, state := range s.connections {
		if state.voice == nil {
			continue
		}
		if state.voice.GuildID != guildID || state.voice.ChannelID != channelID {
			continue
		}
		s.sendDispatchLocked(state, "VOICE_LEFT", map[string]any{
			"ok":        true,
			"guildId":   guildID,
			"channelId": channelID,
			"reason":    "ROOM_CLOSED",
		})
		peers = append(peers, s.removeConnectionVoiceLocked(state, "ROOM_CLOSED")...)
		disconnected++
	}
	s.mu.Unlock()

	for _, peer := range peers {
		s.requestRenegotiation(peer, "room-closed")
	}
	return disconnected
}

func (s *Service) RefreshMemberState(guildID, userID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()

	emitted := 0
	for _, state := range s.connections {
		if state.voice == nil || state.voice.GuildID != guildID || state.userID != userID {
			continue
		}
		s.broadcastGuildLocked(guildID, "VOICE_STATE_UPDATE", map[string]any{
			"guildId":   guildID,
			"channelId": state.voice.ChannelID,
			"userId":    state.userID,
			"muted":     false,
			"deafened":  false,
		})
		emitted++
	}
	return emitted
}

func (s *Service) handleDispatchLocked(state *connectionState, envelope protocol.GatewayEnvelope) ([]protocol.GatewayEnvelope, []*peerState) {
	switch envelope.T {
	case "SUBSCRIBE_GUILD":
		payload := asMap(envelope.D)
		guildID := stringField(payload, "guildId")
		if guildID == state.scope.GuildID {
			state.guilds[guildID] = struct{}{}
		}
		return nil, nil
	case "SUBSCRIBE_CHANNEL":
		payload := asMap(envelope.D)
		channelID := stringField(payload, "channelId")
		if channelID == state.scope.ChannelID {
			state.channels[channelID] = struct{}{}
		}
		return nil, nil
	case "VOICE_JOIN":
		return s.handleVoiceJoinLocked(state, asMap(envelope.D))
	case "VOICE_LEAVE":
		responses, peers := s.handleVoiceLeaveLocked(state)
		return responses, peers
	case "VOICE_SPEAKING":
		return s.handleSpeakingLocked(state, asMap(envelope.D)), nil
	case "VOICE_TRACK_METADATA":
		s.handleTrackMetadataLocked(state, asMap(envelope.D))
		return nil, nil
	case "VOICE_TRACK_STOPPED":
		return nil, s.handleTrackStoppedLocked(state, asMap(envelope.D))
	case "VOICE_WEBRTC_OFFER":
		return s.handleWebRTCOfferLocked(state, asMap(envelope.D))
	case "VOICE_WEBRTC_ANSWER":
		return s.handleWebRTCAnswerLocked(state, asMap(envelope.D))
	case "VOICE_WEBRTC_ICE_CANDIDATE":
		return s.handleICECandidateLocked(state, asMap(envelope.D))
	default:
		return nil, nil
	}
}

func (s *Service) handleVoiceJoinLocked(state *connectionState, payload map[string]any) ([]protocol.GatewayEnvelope, []*peerState) {
	guildID := stringField(payload, "guildId")
	channelID := stringField(payload, "channelId")
	requestID := stringField(payload, "requestId")

	if guildID == "" || channelID == "" {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "BAD_VOICE_JOIN", map[string]any{"requestId": requestID})}, nil
	}
	if guildID != state.scope.GuildID || channelID != state.scope.ChannelID {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "VOICE_SCOPE_MISMATCH", map[string]any{"requestId": requestID})}, nil
	}

	roomPeers := make([]*peerState, 0)
	if state.voice != nil {
		roomPeers = append(roomPeers, s.removeConnectionVoiceLocked(state, "REJOIN")...)
	}

	session := &Session{
		ID:        state.id,
		UserID:    state.userID,
		GuildID:   guildID,
		ChannelID: channelID,
		JoinedAt:  time.Now().UTC(),
	}
	state.voice = session
	state.guilds[guildID] = struct{}{}
	state.channels[channelID] = struct{}{}

	room := s.getOrCreateRoomLocked(guildID, channelID)
	room.sessions[state.id] = state

	s.broadcastRoomLocked(room, "VOICE_USER_JOINED", map[string]any{
		"guildId":   guildID,
		"channelId": channelID,
		"userId":    state.userID,
	}, state.id)
	s.broadcastGuildLocked(guildID, "VOICE_STATE_UPDATE", map[string]any{
		"guildId":   guildID,
		"channelId": channelID,
		"userId":    state.userID,
		"muted":     false,
		"deafened":  false,
	})

	return []protocol.GatewayEnvelope{
		s.dispatchEnvelope(state, "VOICE_JOINED", map[string]any{
			"guildId":   guildID,
			"channelId": channelID,
			"iceServers": []map[string]any{
				{"urls": []string{
					"stun:stun.l.google.com:19302",
					"stun:stun1.l.google.com:19302",
				}},
			},
			"mode":      "webrtc",
			"requestId": requestID,
		}),
	}, roomPeers
}

func (s *Service) handleVoiceLeaveLocked(state *connectionState) ([]protocol.GatewayEnvelope, []*peerState) {
	if state.voice == nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "NOT_IN_VOICE_CHANNEL", nil)}, nil
	}
	guildID := state.voice.GuildID
	channelID := state.voice.ChannelID
	peers := s.removeConnectionVoiceLocked(state, "CLIENT_LEFT")
	return []protocol.GatewayEnvelope{
		s.dispatchEnvelope(state, "VOICE_LEFT", map[string]any{
			"ok":        true,
			"guildId":   guildID,
			"channelId": channelID,
		}),
	}, peers
}

func (s *Service) handleSpeakingLocked(state *connectionState, payload map[string]any) []protocol.GatewayEnvelope {
	if state.voice == nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "NOT_IN_VOICE_CHANNEL", nil)}
	}
	speaking, _ := payload["speaking"].(bool)
	state.voice.Speaking = speaking
	s.broadcastGuildLocked(state.voice.GuildID, "VOICE_SPEAKING", map[string]any{
		"guildId":   state.voice.GuildID,
		"channelId": state.voice.ChannelID,
		"userId":    state.userID,
		"speaking":  speaking,
	})
	return nil
}

func (s *Service) handleTrackMetadataLocked(state *connectionState, payload map[string]any) {
	if state.voice == nil {
		return
	}
	trackID := stringField(payload, "trackId")
	if trackID == "" {
		return
	}
	kind := stringField(payload, "kind")
	source := stringField(payload, "source")
	peer := state.peer
	if peer == nil {
		return
	}
	peer.metadataByTrack[trackID] = trackMetadata{
		TrackID: trackID,
		Kind:    kind,
		Source:  source,
	}
}

func (s *Service) handleTrackStoppedLocked(state *connectionState, payload map[string]any) []*peerState {
	trackID := stringField(payload, "trackId")
	if trackID == "" || state.peer == nil {
		return nil
	}

	for _, producer := range state.peer.producers {
		if producer.trackID == trackID {
			return s.removeProducerLocked(producer.id, "TRACK_STOPPED")
		}
	}
	return nil
}

func (s *Service) handleWebRTCOfferLocked(state *connectionState, payload map[string]any) ([]protocol.GatewayEnvelope, []*peerState) {
	if state.voice == nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "NOT_IN_VOICE_CHANNEL", nil)}, nil
	}
	sdp := stringField(payload, "sdp")
	requestID := stringField(payload, "requestId")
	if sdp == "" {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "BAD_WEBRTC_OFFER", map[string]any{"requestId": requestID})}, nil
	}

	peer, err := s.ensurePeerLocked(state)
	if err != nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "VOICE_PEER_CREATE_FAILED", map[string]any{"requestId": requestID, "details": err.Error()})}, nil
	}

	peer.mu.Lock()
	defer peer.mu.Unlock()

	if err := peer.pc.SetRemoteDescription(pion.SessionDescription{
		Type: pion.SDPTypeOffer,
		SDP:  sdp,
	}); err != nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "VOICE_SET_REMOTE_DESCRIPTION_FAILED", map[string]any{"requestId": requestID, "details": err.Error()})}, nil
	}

	for _, candidate := range peer.pendingICE {
		_ = peer.pc.AddICECandidate(candidate)
	}
	peer.pendingICE = nil

	s.syncPeerSubscriptionsLocked(peer)

	answer, err := peer.pc.CreateAnswer(nil)
	if err != nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "VOICE_CREATE_ANSWER_FAILED", map[string]any{"requestId": requestID, "details": err.Error()})}, nil
	}
	if err := peer.pc.SetLocalDescription(answer); err != nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "VOICE_SET_LOCAL_DESCRIPTION_FAILED", map[string]any{"requestId": requestID, "details": err.Error()})}, nil
	}

	local := peer.pc.LocalDescription()
	if local == nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "VOICE_LOCAL_DESCRIPTION_MISSING", map[string]any{"requestId": requestID})}, nil
	}

	return []protocol.GatewayEnvelope{
		s.dispatchEnvelope(state, "VOICE_WEBRTC_ANSWER", map[string]any{
			"sdp":       local.SDP,
			"type":      "answer",
			"requestId": requestID,
		}),
	}, nil
}

func (s *Service) handleWebRTCAnswerLocked(state *connectionState, payload map[string]any) ([]protocol.GatewayEnvelope, []*peerState) {
	return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "VOICE_UNEXPECTED_ANSWER", nil)}, nil
}

func (s *Service) handleICECandidateLocked(state *connectionState, payload map[string]any) ([]protocol.GatewayEnvelope, []*peerState) {
	if state.peer == nil {
		return nil, nil
	}
	candidateMap := asMap(payload["candidate"])
	candidate := stringField(candidateMap, "candidate")
	if candidate == "" {
		return nil, nil
	}

	init := pion.ICECandidateInit{
		Candidate: candidate,
	}
	if sdpMid := stringField(candidateMap, "sdpMid"); sdpMid != "" {
		init.SDPMid = &sdpMid
	}
	if index, ok := intField(candidateMap, "sdpMLineIndex"); ok {
		lineIndex := uint16(index)
		init.SDPMLineIndex = &lineIndex
	}
	if usernameFragment := stringField(candidateMap, "usernameFragment"); usernameFragment != "" {
		init.UsernameFragment = &usernameFragment
	}

	peer := state.peer
	peer.mu.Lock()
	defer peer.mu.Unlock()

	if peer.pc.RemoteDescription() == nil {
		peer.pendingICE = append(peer.pendingICE, init)
		return nil, nil
	}
	if err := peer.pc.AddICECandidate(init); err != nil {
		return []protocol.GatewayEnvelope{s.voiceErrorEnvelope(state, "VOICE_ADD_ICE_CANDIDATE_FAILED", map[string]any{"details": err.Error()})}, nil
	}
	return nil, nil
}

func (s *Service) ensurePeerLocked(state *connectionState) (*peerState, error) {
	if state.peer != nil && !state.peer.closed {
		return state.peer, nil
	}
	if state.voice == nil {
		return nil, errors.New("VOICE_NOT_JOINED")
	}

	pc, err := s.engine.NewPeerConnection()
	if err != nil {
		return nil, err
	}

	peer := &peerState{
		connState:       state,
		pc:              pc,
		roomKey:         roomKey(state.voice.GuildID, state.voice.ChannelID),
		senders:         make(map[string]*pion.RTPSender),
		producers:       make(map[string]*producerState),
		metadataByTrack: make(map[string]trackMetadata),
	}
	state.peer = peer

	pc.OnICECandidate(func(candidate *pion.ICECandidate) {
		if candidate == nil {
			return
		}
		init := candidate.ToJSON()
		_ = state.conn.Send(s.dispatchEnvelope(state, "VOICE_WEBRTC_ICE_CANDIDATE", map[string]any{
			"candidate": map[string]any{
				"candidate":        init.Candidate,
				"sdpMid":           valueOrEmpty(init.SDPMid),
				"sdpMLineIndex":    valueOrZero(init.SDPMLineIndex),
				"usernameFragment": valueOrEmpty(init.UsernameFragment),
			},
		}))
	})

	pc.OnConnectionStateChange(func(connectionState pion.PeerConnectionState) {
		switch connectionState {
		case pion.PeerConnectionStateFailed, pion.PeerConnectionStateClosed:
			s.RemoveConnection(state.id)
		}
	})

	pc.OnTrack(func(track *pion.TrackRemote, _ *pion.RTPReceiver) {
		s.handleIncomingTrack(peer, track)
	})

	return peer, nil
}

func (s *Service) handleIncomingTrack(peer *peerState, remoteTrack *pion.TrackRemote) {
	s.mu.Lock()
	if peer.closed || peer.connState == nil || peer.connState.voice == nil {
		s.mu.Unlock()
		return
	}
	meta := peer.metadataByTrack[remoteTrack.ID()]
	kind := remoteTrack.Kind().String()
	source := meta.Source
	if source == "" {
		if kind == "audio" {
			source = "microphone"
		} else {
			source = "camera"
		}
	}
	producerID := newID("prod")
	localTrack, err := pion.NewTrackLocalStaticRTP(remoteTrack.Codec().RTPCodecCapability, producerID, peer.connState.userID+":"+source)
	if err != nil {
		s.mu.Unlock()
		return
	}
	producer := &producerState{
		id:          producerID,
		trackID:     remoteTrack.ID(),
		kind:        kind,
		source:      source,
		userID:      peer.connState.userID,
		ownerConnID: peer.connState.id,
		localTrack:  localTrack,
	}
	peer.producers[producerID] = producer
	room := s.rooms[peer.roomKey]
	if room != nil {
		room.producers[producerID] = producer
	}

	targetPeers := make([]*peerState, 0)
	if room != nil {
		for _, other := range room.sessions {
			if other.id == peer.connState.id || other.peer == nil || other.peer.closed {
				continue
			}
			if sender, err := other.peer.pc.AddTrack(localTrack); err == nil {
				other.peer.senders[producerID] = sender
				targetPeers = append(targetPeers, other.peer)
				s.sendDispatchLocked(other, "VOICE_TRACK_AVAILABLE", map[string]any{
					"producerId": producerID,
					"userId":     producer.userID,
					"source":     producer.source,
					"kind":       producer.kind,
				})
				go drainRTCP(sender)
			}
		}
	}
	s.mu.Unlock()

	for _, target := range targetPeers {
		s.requestRenegotiation(target, "new-track")
	}

	buffer := make([]byte, 1600)
	for {
		n, _, readErr := remoteTrack.Read(buffer)
		if readErr != nil {
			break
		}
		if _, writeErr := localTrack.Write(buffer[:n]); writeErr != nil && !errors.Is(writeErr, io.ErrClosedPipe) {
			break
		}
	}

	s.mu.Lock()
	peersToRenegotiate := s.removeProducerLocked(producerID, "TRACK_ENDED")
	s.mu.Unlock()
	for _, target := range peersToRenegotiate {
		s.requestRenegotiation(target, "track-ended")
	}
}

func (s *Service) removeProducerLocked(producerID, reason string) []*peerState {
	var producer *producerState
	var owner *peerState
	var room *roomState
	for _, candidateRoom := range s.rooms {
		if existing := candidateRoom.producers[producerID]; existing != nil {
			producer = existing
			room = candidateRoom
			break
		}
	}
	if producer == nil || room == nil {
		return nil
	}
	for _, state := range room.sessions {
		if state.id == producer.ownerConnID {
			owner = state.peer
			break
		}
	}
	if owner != nil {
		delete(owner.producers, producerID)
	}
	delete(room.producers, producerID)

	peers := make([]*peerState, 0)
	for _, state := range room.sessions {
		if state.peer == nil {
			continue
		}
		if sender, ok := state.peer.senders[producerID]; ok {
			_ = state.peer.pc.RemoveTrack(sender)
			delete(state.peer.senders, producerID)
			peers = append(peers, state.peer)
		}
		if state.id != producer.ownerConnID {
			s.sendDispatchLocked(state, "VOICE_TRACK_REMOVED", map[string]any{
				"producerId": producerID,
				"userId":     producer.userID,
				"source":     producer.source,
				"kind":       producer.kind,
				"reason":     reason,
			})
		}
	}
	return peers
}

func (s *Service) syncPeerSubscriptionsLocked(peer *peerState) {
	room := s.rooms[peer.roomKey]
	if room == nil {
		return
	}
	for producerID, producer := range room.producers {
		if producer.ownerConnID == peer.connState.id {
			continue
		}
		if _, exists := peer.senders[producerID]; exists {
			continue
		}
		if sender, err := peer.pc.AddTrack(producer.localTrack); err == nil {
			peer.senders[producerID] = sender
			s.sendDispatchLocked(peer.connState, "VOICE_TRACK_AVAILABLE", map[string]any{
				"producerId": producer.id,
				"userId":     producer.userID,
				"source":     producer.source,
				"kind":       producer.kind,
			})
			go drainRTCP(sender)
		}
	}
}

func (s *Service) requestRenegotiation(peer *peerState, reason string) {
	if peer == nil || peer.closed {
		return
	}
	_ = peer.connState.conn.Send(s.dispatchEnvelope(peer.connState, "VOICE_RENEGOTIATE_REQUIRED", map[string]any{
		"reason": reason,
	}))
}

func (s *Service) dispatchEnvelope(state *connectionState, eventType string, data any) protocol.GatewayEnvelope {
	state.seq++
	return protocol.GatewayEnvelope{
		Op: "DISPATCH",
		T:  eventType,
		S:  state.seq,
		D:  data,
	}
}

func (s *Service) voiceErrorEnvelope(state *connectionState, code string, extra map[string]any) protocol.GatewayEnvelope {
	payload := map[string]any{
		"error": code,
		"code":  code,
	}
	if state.voice != nil {
		payload["guildId"] = state.voice.GuildID
		payload["channelId"] = state.voice.ChannelID
	}
	for key, value := range extra {
		payload[key] = value
	}
	return s.dispatchEnvelope(state, "VOICE_ERROR", payload)
}

func (s *Service) sendDispatchLocked(state *connectionState, eventType string, data any) {
	_ = state.conn.Send(s.dispatchEnvelope(state, eventType, data))
}

func (s *Service) broadcastGuildLocked(guildID, eventType string, data any) {
	for _, state := range s.connections {
		if state.voice != nil && state.voice.GuildID == guildID {
			s.sendDispatchLocked(state, eventType, data)
			continue
		}
		if _, ok := state.guilds[guildID]; ok {
			s.sendDispatchLocked(state, eventType, data)
		}
	}
}

func (s *Service) broadcastRoomLocked(room *roomState, eventType string, data any, excludeConnID string) {
	for connID, state := range room.sessions {
		if connID == excludeConnID {
			continue
		}
		s.sendDispatchLocked(state, eventType, data)
	}
}

func (s *Service) getOrCreateRoomLocked(guildID, channelID string) *roomState {
	key := roomKey(guildID, channelID)
	room := s.rooms[key]
	if room != nil {
		return room
	}
	room = &roomState{
		guildID:   guildID,
		channelID: channelID,
		sessions:  make(map[string]*connectionState),
		producers: make(map[string]*producerState),
	}
	s.rooms[key] = room
	return room
}

func (s *Service) removeConnectionVoiceLocked(state *connectionState, reason string) []*peerState {
	if state.voice == nil {
		if state.peer != nil {
			state.peer.closed = true
			_ = state.peer.pc.Close()
			state.peer = nil
		}
		return nil
	}
	guildID := state.voice.GuildID
	channelID := state.voice.ChannelID
	roomKey := roomKey(guildID, channelID)
	room := s.rooms[roomKey]

	peers := make([]*peerState, 0)
	if state.peer != nil {
		for producerID := range state.peer.producers {
			peers = append(peers, s.removeProducerLocked(producerID, reason)...)
		}
		state.peer.closed = true
		_ = state.peer.pc.Close()
		state.peer = nil
	}

	if room != nil {
		delete(room.sessions, state.id)
		if len(room.sessions) == 0 {
			delete(s.rooms, roomKey)
		}
	}

	s.broadcastGuildLocked(guildID, "VOICE_STATE_UPDATE", map[string]any{
		"guildId":   guildID,
		"channelId": channelID,
		"userId":    state.userID,
		"muted":     false,
		"deafened":  false,
		"left":      true,
	})
	s.broadcastGuildLocked(guildID, "VOICE_USER_LEFT", map[string]any{
		"guildId":   guildID,
		"channelId": channelID,
		"userId":    state.userID,
		"reason":    reason,
	})
	state.voice = nil
	return peers
}

func roomKey(guildID, channelID string) string {
	return guildID + ":" + channelID
}

func asMap(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return map[string]any{}
}

func stringField(values map[string]any, key string) string {
	raw, _ := values[key].(string)
	return raw
}

func intField(values map[string]any, key string) (int, bool) {
	raw := values[key]
	switch typed := raw.(type) {
	case float64:
		return int(typed), true
	case int:
		return typed, true
	default:
		return 0, false
	}
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func valueOrZero(value *uint16) int {
	if value == nil {
		return 0
	}
	return int(*value)
}

func newID(prefix string) string {
	return prefix + "-" + time.Now().UTC().Format("20060102150405.000000000")
}

func drainRTCP(sender *pion.RTPSender) {
	buffer := make([]byte, 1500)
	for {
		if _, _, err := sender.Read(buffer); err != nil {
			return
		}
	}
}
