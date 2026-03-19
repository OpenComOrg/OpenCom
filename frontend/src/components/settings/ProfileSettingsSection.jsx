export function ProfileSettingsSection({
  profileForm,
  setProfileForm,
  onAvatarUpload,
  onBannerUpload,
  onAudioFieldUpload,
  saveProfile,
  testNotificationSound,
  isDesktopRuntime,
  openPreferredDesktopDownload,
  preferredDownloadTarget,
  downloadTargets,
  onOpenProfileStudio,
  rpcForm,
  setRpcForm,
  onImageFieldUpload,
  saveRichPresence,
  clearRichPresence,
}) {
  return (
    <div className="card">
      <h4>Profile Settings</h4>
      <label>
        Username
        <input
          value={profileForm.username}
          onChange={(event) =>
            setProfileForm((current) => ({
              ...current,
              username: event.target.value,
            }))
          }
          minLength={2}
          maxLength={32}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <label>
        Display Name
        <input
          value={profileForm.displayName}
          onChange={(event) =>
            setProfileForm((current) => ({
              ...current,
              displayName: event.target.value,
            }))
          }
        />
      </label>
      <label>
        Bio
        <textarea
          rows={4}
          value={profileForm.bio}
          onChange={(event) =>
            setProfileForm((current) => ({
              ...current,
              bio: event.target.value,
            }))
          }
        />
      </label>
      <label>
        Avatar URL
        <input
          value={profileForm.pfpUrl}
          onChange={(event) =>
            setProfileForm((current) => ({
              ...current,
              pfpUrl: event.target.value,
            }))
          }
        />
      </label>
      <label>
        Upload Avatar
        <input type="file" accept="image/*" onChange={onAvatarUpload} />
      </label>
      <label>
        Banner URL
        <input
          value={profileForm.bannerUrl}
          onChange={(event) =>
            setProfileForm((current) => ({
              ...current,
              bannerUrl: event.target.value,
            }))
          }
        />
      </label>
      <label>
        Upload Banner
        <input type="file" accept="image/*" onChange={onBannerUpload} />
      </label>
      <label>
        Notification Sound URL
        <input
          value={profileForm.notificationSoundUrl}
          onChange={(event) =>
            setProfileForm((current) => ({
              ...current,
              notificationSoundUrl: event.target.value,
            }))
          }
          placeholder="https://... or /v1/profile-images/users/..."
        />
      </label>
      <label>
        Upload Notification Sound
        <input
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/x-m4a"
          onChange={(event) =>
            onAudioFieldUpload(event, "notification sound", (mediaUrl) =>
              setProfileForm((current) => ({
                ...current,
                notificationSoundUrl: mediaUrl,
              })),
            )
          }
        />
      </label>
      <div className="row-actions" style={{ width: "100%" }}>
        <button type="button" className="ghost" onClick={testNotificationSound}>
          Test Sound
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() =>
            setProfileForm((current) => ({
              ...current,
              notificationSoundUrl: "",
            }))
          }
        >
          Use Default Beep
        </button>
      </div>
      <p className="hint">
        Paste a direct audio URL or upload an MP3, WAV, OGG, or M4A file, then
        save your profile to apply it.
      </p>
      <button onClick={saveProfile}>Save Profile</button>

      {!isDesktopRuntime && (
        <>
          <hr
            style={{
              borderColor: "var(--border-subtle)",
              width: "100%",
            }}
          />
          <h4>Desktop Client</h4>
          <p className="hint">
            Install the desktop client for the smoothest chat and voice
            experience.
          </p>
          <div className="row-actions" style={{ width: "100%" }}>
            <button type="button" onClick={openPreferredDesktopDownload}>
              {preferredDownloadTarget
                ? `Download ${preferredDownloadTarget.label}`
                : "Download client"}
            </button>
            {downloadTargets
              .filter((target) => target.href !== preferredDownloadTarget?.href)
              .map((target) => (
                <button
                  key={target.href}
                  type="button"
                  className="ghost"
                  onClick={() =>
                    window.open(target.href, "_blank", "noopener,noreferrer")
                  }
                >
                  {target.label}
                </button>
              ))}
          </div>
        </>
      )}

      <hr
        style={{
          borderColor: "var(--border-subtle)",
          width: "100%",
        }}
      />
      <h4>Full Profile Studio</h4>
      <p className="hint">
        Use the dedicated Profile page for drag-and-drop full profile
        customization.
      </p>
      <button type="button" className="ghost" onClick={onOpenProfileStudio}>
        Open Profile Studio
      </button>

      <hr
        style={{
          borderColor: "var(--border-subtle)",
          width: "100%",
        }}
      />
      <h4>Rich Presence (RPC-style)</h4>
      <p className="hint">
        No app ID needed. Upload images or paste URLs for the artwork, and use
        full http(s) links for buttons.
      </p>
      <label>
        Activity Name
        <input
          value={rpcForm.name}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          placeholder="Playing OpenCom"
        />
      </label>
      <label>
        Details
        <input
          value={rpcForm.details}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              details: event.target.value,
            }))
          }
          placeholder="In a voice channel"
        />
      </label>
      <label>
        State
        <input
          value={rpcForm.state}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              state: event.target.value,
            }))
          }
          placeholder="With friends"
        />
      </label>
      <label>
        Large Image URL
        <input
          value={rpcForm.largeImageUrl}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              largeImageUrl: event.target.value,
            }))
          }
          placeholder="https://..."
        />
      </label>
      <label>
        Upload Large Image
        <input
          type="file"
          accept="image/*"
          onChange={(event) =>
            onImageFieldUpload(event, "large image", (imageUrl) =>
              setRpcForm((current) => ({
                ...current,
                largeImageUrl: imageUrl,
              })),
            )
          }
        />
      </label>
      <label>
        Large Image Text
        <input
          value={rpcForm.largeImageText}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              largeImageText: event.target.value,
            }))
          }
          placeholder="Tooltip text"
        />
      </label>
      <label>
        Small Image URL
        <input
          value={rpcForm.smallImageUrl}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              smallImageUrl: event.target.value,
            }))
          }
          placeholder="https://..."
        />
      </label>
      <label>
        Upload Small Image
        <input
          type="file"
          accept="image/*"
          onChange={(event) =>
            onImageFieldUpload(event, "small image", (imageUrl) =>
              setRpcForm((current) => ({
                ...current,
                smallImageUrl: imageUrl,
              })),
            )
          }
        />
      </label>
      <label>
        Small Image Text
        <input
          value={rpcForm.smallImageText}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              smallImageText: event.target.value,
            }))
          }
          placeholder="Tooltip text"
        />
      </label>
      <label>
        Button 1 Label
        <input
          value={rpcForm.button1Label}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              button1Label: event.target.value,
            }))
          }
          placeholder="Watch"
        />
      </label>
      <label>
        Button 1 URL
        <input
          value={rpcForm.button1Url}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              button1Url: event.target.value,
            }))
          }
          placeholder="https://..."
        />
      </label>
      <label>
        Button 2 Label
        <input
          value={rpcForm.button2Label}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              button2Label: event.target.value,
            }))
          }
          placeholder="Join"
        />
      </label>
      <label>
        Button 2 URL
        <input
          value={rpcForm.button2Url}
          onChange={(event) =>
            setRpcForm((current) => ({
              ...current,
              button2Url: event.target.value,
            }))
          }
          placeholder="https://..."
        />
      </label>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button onClick={saveRichPresence}>Save Rich Presence</button>
        <button className="ghost" onClick={clearRichPresence}>
          Clear
        </button>
      </div>
    </div>
  );
}
