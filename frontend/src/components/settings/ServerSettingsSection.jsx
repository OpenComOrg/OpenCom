function resolveRoleColor(role) {
  if (role?.color == null || role.color === "") return "#99aab5";
  if (typeof role.color === "number") {
    return `#${Number(role.color).toString(16).padStart(6, "0")}`;
  }
  return role.color;
}

export function ServerSettingsSection({ serverState, forms, actions }) {
  const {
    activeServer,
    servers,
    canManageServer,
    boostStatus,
    activeServerVoiceGatewayPref,
    categoryChannels,
    sortedChannels,
    channelPermsChannelId,
    guildState,
  } = serverState;

  const {
    serverProfileForm,
    newServerName,
    newServerBaseUrl,
    newServerLogoUrl,
    newServerBannerUrl,
    newChannelName,
    newChannelType,
    newChannelParentId,
    newServerEmoteName,
    newServerEmoteUrl,
  } = forms;

  const {
    setServerProfileForm,
    onImageFieldUpload,
    saveActiveServerProfile,
    setNewServerName,
    setNewServerBaseUrl,
    setNewServerLogoUrl,
    setNewServerBannerUrl,
    createServer,
    updateActiveServerVoiceGatewayPref,
    setNewChannelName,
    setNewChannelType,
    setNewChannelParentId,
    createChannel,
    setNewServerEmoteName,
    setNewServerEmoteUrl,
    createServerEmote,
    removeServerEmote,
    toggleActiveServerGlobalEmotes,
    setChannelPermsChannelId,
    channelOverwriteAllowsSend,
    setChannelRoleSend,
  } = actions;

  return (
    <>
      {activeServer && canManageServer && (
        <section className="card">
          <h4>Server Branding</h4>
          <input
            placeholder="Server name"
            value={serverProfileForm.name ?? ""}
            onChange={(event) =>
              setServerProfileForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
          <input
            placeholder="Logo URL"
            value={serverProfileForm.logoUrl ?? ""}
            onChange={(event) =>
              setServerProfileForm((current) => ({
                ...current,
                logoUrl: event.target.value,
              }))
            }
          />
          <label>
            Upload Logo
            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                onImageFieldUpload(event, "server logo", (imageUrl) =>
                  setServerProfileForm((current) => ({
                    ...current,
                    logoUrl: imageUrl,
                  })),
                )
              }
            />
          </label>
          <input
            placeholder="Banner URL"
            value={serverProfileForm.bannerUrl ?? ""}
            onChange={(event) =>
              setServerProfileForm((current) => ({
                ...current,
                bannerUrl: event.target.value,
              }))
            }
          />
          <label>
            Upload Banner
            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                onImageFieldUpload(event, "server banner", (imageUrl) =>
                  setServerProfileForm((current) => ({
                    ...current,
                    bannerUrl: imageUrl,
                  })),
                )
              }
            />
          </label>
          <button onClick={saveActiveServerProfile}>Save Server Profile</button>
        </section>
      )}

      <section className="card">
        <h4>Add Server Provider</h4>
        <input
          placeholder="Server name"
          value={newServerName ?? ""}
          onChange={(event) => setNewServerName(event.target.value)}
        />
        <input
          placeholder="https://node.provider.tld"
          value={newServerBaseUrl ?? "https://"}
          onChange={(event) => setNewServerBaseUrl(event.target.value)}
        />
        <input
          placeholder="Logo URL (.png/.jpg/.webp/.svg)"
          value={newServerLogoUrl ?? ""}
          onChange={(event) => setNewServerLogoUrl(event.target.value)}
        />
        <label>
          Upload Logo
          <input
            type="file"
            accept="image/*"
            onChange={(event) =>
              onImageFieldUpload(event, "server logo", setNewServerLogoUrl)
            }
          />
        </label>
        <input
          placeholder="Banner URL (optional)"
          value={newServerBannerUrl ?? ""}
          onChange={(event) => setNewServerBannerUrl(event.target.value)}
        />
        <label>
          Upload Banner
          <input
            type="file"
            accept="image/*"
            onChange={(event) =>
              onImageFieldUpload(event, "server banner", setNewServerBannerUrl)
            }
          />
        </label>
        <button
          onClick={createServer}
          disabled={
            !newServerName.trim() ||
            !newServerBaseUrl.trim() ||
            !newServerLogoUrl.trim()
          }
        >
          Add Server
        </button>
      </section>

      {activeServer && canManageServer && (
        <section className="card">
          <h4>Voice Gateway Routing</h4>
          <p className="hint">
            Default is OpenCom core gateway. Switch to self-hosted to reduce
            latency for your server.
          </p>
          <label>
            Voice Gateway Mode
            <select
              value={activeServerVoiceGatewayPref.mode}
              onChange={(event) =>
                updateActiveServerVoiceGatewayPref({
                  mode: event.target.value === "server" ? "server" : "core",
                })
              }
            >
              <option value="core">OpenCom Core (default)</option>
              <option value="server">Self-hosted/Server-first</option>
            </select>
          </label>
          <label>
            Optional custom gateway URL
            <input
              placeholder="https://gateway.yourserver.tld"
              value={activeServerVoiceGatewayPref.customUrl}
              onChange={(event) =>
                updateActiveServerVoiceGatewayPref({
                  customUrl: event.target.value,
                })
              }
            />
          </label>
          <p className="hint">
            Client fallback order follows this mode and automatically tries the
            other gateways if one fails.
          </p>
        </section>
      )}

      {activeServer && canManageServer && (
        <section className="card">
          <h4>Create Channel</h4>
          <input
            placeholder="New channel/category"
            value={newChannelName ?? ""}
            onChange={(event) => setNewChannelName(event.target.value)}
          />
          <select
            value={newChannelType ?? "text"}
            onChange={(event) => setNewChannelType(event.target.value)}
          >
            <option value="text">Text Channel</option>
            <option value="voice">Voice Channel</option>
            <option value="category">Category</option>
          </select>
          {newChannelType !== "category" && (
            <select
              value={newChannelParentId ?? ""}
              onChange={(event) => setNewChannelParentId(event.target.value)}
            >
              <option value="">No category</option>
              {(categoryChannels || []).map((category) => (
                <option key={category?.id ?? ""} value={category?.id ?? ""}>
                  {category?.name ?? "Category"}
                </option>
              ))}
            </select>
          )}
          <button onClick={createChannel}>Create Channel</button>
        </section>
      )}

      {activeServer && canManageServer && (
        <section className="card">
          <h4>Custom Emotes</h4>
          <p className="hint">
            Use emotes in chat with <code>:name:</code>.
          </p>
          {(activeServer?.roles || []).includes("owner") && (
            <>
              <label
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <input
                  type="checkbox"
                  checked={!!activeServer?.globalEmotesEnabled}
                  onChange={(event) =>
                    toggleActiveServerGlobalEmotes(event.target.checked)
                  }
                />
                Allow members to use this server&apos;s custom emotes globally
                (Boost perk)
              </label>
              <p className="hint">
                {activeServer?.globalEmotesEnabled && !boostStatus?.active
                  ? "Saved as enabled, but it only works while your Boost is active."
                  : "When enabled, your members can use these custom emotes in DMs and other servers too."}
              </p>
            </>
          )}
          <input
            placeholder="Emote name (example: hype)"
            value={newServerEmoteName}
            onChange={(event) => setNewServerEmoteName(event.target.value)}
          />
          <input
            placeholder="Emote image URL (.png/.gif/.webp/.svg)"
            value={newServerEmoteUrl}
            onChange={(event) => setNewServerEmoteUrl(event.target.value)}
          />
          <label>
            Upload Emote Image
            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                onImageFieldUpload(event, "emote image", setNewServerEmoteUrl)
              }
            />
          </label>
          <button onClick={createServerEmote}>Create Emote</button>
          <ul className="channel-perms-role-list" style={{ marginTop: "10px" }}>
            {(guildState?.emotes || []).map((emote) => (
              <li key={emote.id}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <img
                    className="message-custom-emote"
                    src={emote.imageUrl || emote.image_url}
                    alt={emote.name}
                  />
                  <code>:{emote.name}:</code>
                </span>
                <button
                  className="ghost"
                  style={{ marginLeft: "8px" }}
                  onClick={() => removeServerEmote(emote.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeServer && canManageServer && (
        <section className="card">
          <h4>Channel permissions</h4>
          <p className="hint">
            Choose a channel and set which roles can send messages there. By
            default everyone can send.
          </p>
          <select
            value={channelPermsChannelId}
            onChange={(event) => setChannelPermsChannelId(event.target.value)}
          >
            <option value="">Select channel</option>
            {(sortedChannels || [])
              .filter((channel) => channel.type === "text")
              .map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
          </select>
          {channelPermsChannelId && (
            <ul className="channel-perms-role-list">
              {(guildState?.roles || [])
                .filter((role) => !role.is_everyone)
                .sort((left, right) => (right.position ?? 0) - (left.position ?? 0))
                .map((role) => (
                  <li key={role.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={channelOverwriteAllowsSend(
                          channelPermsChannelId,
                          role.id,
                        )}
                        onChange={(event) =>
                          setChannelRoleSend(
                            channelPermsChannelId,
                            role.id,
                            event.target.checked,
                          )
                        }
                      />
                      <span
                        className="channel-perms-role-name"
                        style={{ color: resolveRoleColor(role) }}
                      >
                        {role.name}
                      </span>
                      <span className="hint"> can send here</span>
                    </label>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {!activeServer && servers.length > 0 && (
        <p className="hint">
          Select a server from the sidebar to manage channels, roles, and server settings.
        </p>
      )}
    </>
  );
}
