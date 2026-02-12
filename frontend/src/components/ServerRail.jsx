import { useState } from "react";

export function ServerRail({ servers, activeServerId, onServerSelect, onNewServer }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onNewServer(newName);
    setNewName("");
    setShowCreate(false);
  };

  return (
    <div className="server-rail">
      <div className="rail-header" title="OpenCom">OC</div>
      <div className="server-list">
        {servers.map((server) => (
          <button
            key={server.id}
            className={`server-pill ${activeServerId === server.id ? 'active' : ''}`}
            onClick={() => onServerSelect(server.id)}
            title={server.name}
          >
            {server.name.substring(0, 2).toUpperCase()}
          </button>
        ))}
        <button 
          className="server-pill"
          onClick={() => setShowCreate(!showCreate)}
          title="Create or join server"
        >
          +
        </button>
      </div>

      {showCreate && (
        <div style={{ padding: "10px", borderTop: "1px solid var(--border-subtle)" }}>
          <input
            type="text"
            placeholder="Server name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            style={{ width: "100%", marginBottom: "8px" }}
          />
          <button onClick={handleCreate} style={{ width: "100%" }}>Create</button>
        </div>
      )}
    </div>
  );
}
