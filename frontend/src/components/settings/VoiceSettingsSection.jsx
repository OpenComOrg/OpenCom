export function VoiceSettingsSection({
  audioInputDeviceId,
  setAudioInputDeviceId,
  audioInputDevices,
  audioOutputDeviceId,
  setAudioOutputDeviceId,
  audioOutputDevices,
  isMicMonitorActive,
  toggleMicMonitor,
  isInVoiceChannel,
  micGain,
  setMicGain,
  micSensitivity,
  setMicSensitivity,
  noiseSuppressionEnabled,
  setNoiseSuppressionEnabled,
  noiseCancellationMode,
  setNoiseCancellationMode,
  smartNoiseSuppressionProfile,
  applySmartNoiseSuppressionProfile,
  noiseSuppressionPreset,
  applyNoiseSuppressionPreset,
  noiseSuppressionConfig,
  updateNoiseSuppressionConfig,
  localAudioProcessingInfo,
}) {
  const smartMode = noiseCancellationMode !== "advanced";
  const smartBrowserSupport = localAudioProcessingInfo?.supported
    ?.noiseSuppression
    ? "Browser assist available"
    : "Client cleanup only";

  return (
    <section className="card">
      <h4>Voice Settings</h4>
      <label>
        Input Device
        <select
          value={audioInputDeviceId}
          onChange={(event) => setAudioInputDeviceId(event.target.value)}
        >
          <option value="">System default</option>
          {audioInputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${device.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </label>
      <label>
        Output Device
        <select
          value={audioOutputDeviceId}
          onChange={(event) => setAudioOutputDeviceId(event.target.value)}
        >
          <option value="">System default</option>
          {audioOutputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Speaker ${device.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </label>
      <div className="row-actions" style={{ width: "100%" }}>
        <button
          type="button"
          className={isMicMonitorActive ? "danger" : "ghost"}
          onClick={toggleMicMonitor}
          disabled={!isInVoiceChannel && !isMicMonitorActive}
        >
          {isMicMonitorActive ? "Stop Mic Test" : "Start Mic Test"}
        </button>
        <span className="hint">
          {isMicMonitorActive
            ? "Mic test is active: you're muted/deafened while hearing your processed mic."
            : "Hear your mic as others hear it (while muted + deafened)."}
        </span>
      </div>
      <label>
        Microphone Gain ({micGain}%)
        <input
          type="range"
          min="0"
          max="200"
          step="5"
          value={micGain}
          onChange={(event) => setMicGain(Number(event.target.value))}
        />
      </label>
      <label>
        Mic Sensitivity ({micSensitivity}%)
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={micSensitivity}
          onChange={(event) => setMicSensitivity(Number(event.target.value))}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={noiseSuppressionEnabled}
          onChange={(event) => {
            const enabled = event.target.checked;
            setNoiseSuppressionEnabled(enabled);
            if (enabled && smartMode) {
              applySmartNoiseSuppressionProfile({ ensureEnabled: false });
            }
          }}
        />{" "}
        Noise Cancellation
      </label>
      <div className="row-actions" style={{ width: "100%" }}>
        <button
          type="button"
          className={smartMode ? "" : "ghost"}
          onClick={() => {
            setNoiseCancellationMode("smart");
            if (noiseSuppressionEnabled) {
              applySmartNoiseSuppressionProfile({ ensureEnabled: false });
            }
          }}
        >
          Simple
        </button>
        <button
          type="button"
          className={!smartMode ? "" : "ghost"}
          onClick={() => setNoiseCancellationMode("advanced")}
        >
          Advanced
        </button>
      </div>
      {smartMode ? (
        <div
          style={{
            width: "100%",
            borderRadius: "18px",
            border: "1px solid rgba(120, 150, 220, 0.22)",
            background:
              "linear-gradient(180deg, rgba(20, 31, 56, 0.86), rgba(13, 22, 40, 0.92))",
            padding: "16px 18px",
            display: "grid",
            gap: "10px",
          }}
        >
          <div>
            <strong style={{ display: "block", marginBottom: "4px" }}>
              Smart Noise Cancellation
            </strong>
            <span className="hint" style={{ display: "block" }}>
              One tap auto-tunes the built-in cleanup stack for your mic gain,
              sensitivity, and browser support.
            </span>
          </div>
          <div className="row-actions" style={{ width: "100%" }}>
            <button
              type="button"
              onClick={() => applySmartNoiseSuppressionProfile()}
            >
              {noiseSuppressionEnabled ? "Re-tune Automatically" : "Turn On & Auto-Tune"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setNoiseCancellationMode("advanced")}
            >
              Open Advanced
            </button>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            <strong>{smartNoiseSuppressionProfile?.label || "Balanced cleanup"}</strong>
            {" · "}
            {smartNoiseSuppressionProfile?.summary}
          </p>
          <p className="hint" style={{ margin: 0 }}>
            Current auto base:{" "}
            {smartNoiseSuppressionProfile?.preset || "balanced"} preset ·{" "}
            {smartBrowserSupport}
          </p>
        </div>
      ) : (
        <>
          <label>
            Noise Preset
            <select
              value={noiseSuppressionPreset}
              onChange={(event) => applyNoiseSuppressionPreset(event.target.value)}
            >
              <option value="strict">Strict (default)</option>
              <option value="balanced">Balanced</option>
              <option value="light">Light</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <div className="row-actions" style={{ width: "100%" }}>
            <button
              type="button"
              className="ghost"
              onClick={() => applyNoiseSuppressionPreset("strict")}
            >
              Use Strict
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => applyNoiseSuppressionPreset("balanced")}
            >
              Use Balanced
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => applyNoiseSuppressionPreset("light")}
            >
              Use Light
            </button>
          </div>
          <label>
            Gate Open Threshold ({Number(noiseSuppressionConfig.gateOpenRms || 0).toFixed(3)})
            <input
              type="range"
              min="0.004"
              max="0.06"
              step="0.001"
              value={noiseSuppressionConfig.gateOpenRms}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  gateOpenRms: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Gate Close Threshold (
            {Number(noiseSuppressionConfig.gateCloseRms || 0).toFixed(3)})
            <input
              type="range"
              min="0.002"
              max="0.05"
              step="0.001"
              value={noiseSuppressionConfig.gateCloseRms}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  gateCloseRms: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Gate Attack ({Math.round(Number(noiseSuppressionConfig.gateAttack || 0) * 100)}
            %)
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={noiseSuppressionConfig.gateAttack}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  gateAttack: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Gate Release (
            {Math.round(Number(noiseSuppressionConfig.gateRelease || 0) * 1000)} ms
            factor)
            <input
              type="range"
              min="0.01"
              max="0.8"
              step="0.01"
              value={noiseSuppressionConfig.gateRelease}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  gateRelease: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            High-pass Cutoff ({Math.round(Number(noiseSuppressionConfig.highpassHz || 0))}{" "}
            Hz)
            <input
              type="range"
              min="40"
              max="300"
              step="5"
              value={noiseSuppressionConfig.highpassHz}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  highpassHz: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Low-pass Cutoff ({Math.round(Number(noiseSuppressionConfig.lowpassHz || 0))}{" "}
            Hz)
            <input
              type="range"
              min="4200"
              max="14000"
              step="100"
              value={noiseSuppressionConfig.lowpassHz}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  lowpassHz: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Compressor Threshold (
            {Math.round(Number(noiseSuppressionConfig.compressorThreshold || 0))} dB)
            <input
              type="range"
              min="-70"
              max="-8"
              step="1"
              value={noiseSuppressionConfig.compressorThreshold}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  compressorThreshold: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Compressor Knee ({Math.round(Number(noiseSuppressionConfig.compressorKnee || 0))}{" "}
            dB)
            <input
              type="range"
              min="0"
              max="40"
              step="1"
              value={noiseSuppressionConfig.compressorKnee}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  compressorKnee: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Compressor Ratio ({Number(noiseSuppressionConfig.compressorRatio || 0).toFixed(1)}
            :1)
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={noiseSuppressionConfig.compressorRatio}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  compressorRatio: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Compressor Attack (
            {Number(noiseSuppressionConfig.compressorAttack || 0).toFixed(3)} s)
            <input
              type="range"
              min="0.001"
              max="0.05"
              step="0.001"
              value={noiseSuppressionConfig.compressorAttack}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  compressorAttack: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Compressor Release (
            {Number(noiseSuppressionConfig.compressorRelease || 0).toFixed(3)} s)
            <input
              type="range"
              min="0.04"
              max="0.8"
              step="0.01"
              value={noiseSuppressionConfig.compressorRelease}
              onChange={(event) =>
                updateNoiseSuppressionConfig({
                  compressorRelease: Number(event.target.value),
                })
              }
            />
          </label>
        </>
      )}
      {localAudioProcessingInfo && (
        <p className="hint">
          Noise suppression requested:{" "}
          {localAudioProcessingInfo.requested?.noiseSuppression ? "On" : "Off"} ·
          applied:{" "}
          {localAudioProcessingInfo.applied?.noiseSuppression == null
            ? "Unknown"
            : localAudioProcessingInfo.applied.noiseSuppression
              ? "On"
              : "Off"}
          {!localAudioProcessingInfo.supported?.noiseSuppression
            ? " (not supported by this browser/device)"
            : ""}
          {localAudioProcessingInfo.client?.processingActive
            ? ` · client filter: on (${localAudioProcessingInfo.client?.noisePreset || "strict"}) · gain: ${Math.round(Number(localAudioProcessingInfo.client?.micGainPercent || 100))}%`
            : ""}
        </p>
      )}
      <p className="hint">
        Hotkeys: Ctrl/Cmd+Shift+M mute, Ctrl/Cmd+Shift+D deafen,
        Ctrl/Cmd+Shift+V screen share, Ctrl/Cmd+Shift+X disconnect,
        Ctrl/Cmd+Shift+, settings.
      </p>
      <p className="hint">
        Tip: allow microphone permissions so device names show properly.
      </p>
    </section>
  );
}
