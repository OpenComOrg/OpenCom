import { useState, useEffect, useRef } from "react";

export function VoiceChannel({ 
  channelId, 
  channelName,
  voiceMembers = [],
  isConnected = false,
  onConnect,
  onDisconnect,
  onMuteToggle,
  onDeafenToggle
}) {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [callActive, setCallActive] = useState(false);

  const handleConnect = async () => {
    try {
      await onConnect?.(channelId);
      setCallActive(true);
    } catch (err) {
      console.error("Failed to join voice:", err);
    }
  };

  const handleDisconnect = async () => {
    try {
      await onDisconnect?.();
      setCallActive(false);
    } catch (err) {
      console.error("Failed to leave voice:", err);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      padding: "16px",
      borderRadius: "12px",
      background: "var(--bg-elev)",
      border: "1px solid var(--border-subtle)"
    }}>
      <div>
        <h3 style={{ margin: "0 0 8px 0" }}>🔊 {channelName}</h3>
        <p style={{ margin: "0", fontSize: "13px", color: "var(--text-dim)" }}>
          {voiceMembers.length} {voiceMembers.length === 1 ? "member" : "members"}
        </p>
      </div>

      {voiceMembers.length > 0 && (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: "8px"
        }}>
          {voiceMembers.map(member => (
            <div key={member.id} style={{
              padding: "8px",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "8px",
              textAlign: "center",
              fontSize: "12px"
            }}>
              {member.username}
              {member.muted && <span> 🔇</span>}
              {member.deafened && <span> 🔇🔇</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        {!callActive ? (
          <button onClick={handleConnect} style={{ flex: 1 }}>
            Join Voice
          </button>
        ) : (
          <>
            <button 
              onClick={() => {
                setIsMuted(!isMuted);
                onMuteToggle?.(!isMuted);
              }}
              className={isMuted ? "danger" : ""}
              style={{ flex: 1 }}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button 
              onClick={() => {
                setIsDeafened(!isDeafened);
                onDeafenToggle?.(!isDeafened);
              }}
              className={isDeafened ? "danger" : ""}
              style={{ flex: 1 }}
            >
              {isDeafened ? "Undeafen" : "Deafen"}
            </button>
            <button onClick={handleDisconnect} className="danger" style={{ flex: 1 }}>
              Leave
            </button>
          </>
        )}
      </div>
    </div>
  );
}
