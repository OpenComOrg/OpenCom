import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSfuVoiceClient,
  VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
  VOICE_NOISE_SUPPRESSION_PRESETS,
} from "./voice/sfuClient";
import { LandingPage } from "./components/LandingPage";
import { AuthShell } from "./components/AuthShell";
import { TermsPage } from "./components/TermsPage";
import { BlogsPage } from "./components/BlogsPage";
import { BlogPostPage } from "./components/BlogPostPage";
import { parseBlogMarkdown } from "./lib/blogMarkdown";
import {
  IncomingCallToast,
  CallMessageCard,
  OutgoingCallToast,
} from "./components/PrivateCallOverlay";
import { ServerRailNav } from "./components/app/ServerRailNav";
import { FriendsSurface } from "./components/app/FriendsSurface";
import { ProfileStudioPage } from "./components/app/ProfileStudioPage";
import { VoiceCallStage } from "./components/app/VoiceCallStage";
import { AppContextMenus } from "./components/app/AppContextMenus";
import { AddServerModal } from "./components/app/AddServerModal";
import { FavouriteMediaModal } from "./components/app/FavouriteMediaModal";
import { KlipyMediaModal } from "./components/app/KlipyMediaModal";
import { MediaViewerModal } from "./components/app/MediaViewerModal";
import { MessageReactionPickerModal } from "./components/app/MessageReactionPickerModal";
import { MemberProfilePopout } from "./components/app/MemberProfilePopout";
import { FullProfileViewerModal } from "./components/app/FullProfileViewerModal";
import { AppDialogModal } from "./components/app/AppDialogModal";
import {
  BoostUpsellModal,
  BoostGiftPromptModal,
} from "./components/app/BoostModals";
import { SettingsOverlay } from "./components/settings/SettingsOverlay";
import { ServerSettingsSection } from "./components/settings/ServerSettingsSection";
import { ProfileSettingsSection } from "./components/settings/ProfileSettingsSection";
import { RolesSettingsSection } from "./components/settings/RolesSettingsSection";
import { ModerationSettingsSection } from "./components/settings/ModerationSettingsSection";
import { InvitesSettingsSection } from "./components/settings/InvitesSettingsSection";
import { ExtensionsSettingsSection } from "./components/settings/ExtensionsSettingsSection";
import { AppearanceSettingsSection } from "./components/settings/AppearanceSettingsSection";
import { VoiceSettingsSection } from "./components/settings/VoiceSettingsSection";
import { BillingSettingsSection } from "./components/settings/BillingSettingsSection";
import { SecuritySettingsSection } from "./components/settings/SecuritySettingsSection";
import { SafeAvatar } from "./components/ui/SafeAvatar";
import { HeadphonesIcon, MicrophoneIcon } from "./components/ui/VoiceIcons";
import { ThemeStudioApp } from "./theme/ThemeStudioApp.jsx";
import { ServerAdminApp } from "./admin/ServerAdminApp.jsx";
import {
  DOWNLOAD_TARGETS,
  getDeviceDownloadContext,
  getMobileDownloadTarget,
  getPreferredDownloadTarget,
} from "./lib/downloads";
import {
  BUILTIN_EMOTES,
  BUILTIN_EMOTE_CATEGORIES,
  BUILTIN_EMOTE_ENTRIES,
} from "./lib/builtinEmotes";
import { uploadFileInChunks } from "./utils/chunkedUploads";
import {
  APP_ROUTE_CLIENT,
  APP_ROUTE_BLOGS,
  APP_ROUTE_HOME,
  APP_ROUTE_LOGIN,
  APP_ROUTE_PANEL,
  APP_ROUTE_TERMS,
  buildBoostGiftUrl,
  buildInviteJoinUrl,
  getBlogSlugFromPath,
  getAppRouteFromLocation,
  getBoostGiftCodeFromCurrentLocation,
  getInviteCodeFromCurrentLocation,
  isBlogPostPath,
  isBoostGiftPath,
  isInviteJoinPath,
  normalizeAppPath,
  openStaticPage,
  shouldSkipLandingPage,
  parseBoostGiftCodeFromInput,
  parseInviteCodeFromInput,
  resolveStaticPageHref,
  writeAppRoute,
} from "./lib/routing";
import {
  ACCESS_TOKEN_KEY,
  ACTIVE_DM_KEY,
  AUDIO_INPUT_DEVICE_KEY,
  AUDIO_OUTPUT_DEVICE_KEY,
  CLIENT_EXTENSIONS_DEV_MODE_KEY,
  CLIENT_EXTENSIONS_DEV_URLS_KEY,
  CLIENT_EXTENSIONS_ENABLED_KEY,
  CORE_API,
  DEBUG_VOICE_STORAGE_KEY,
  GATEWAY_DEVICE_ID_KEY,
  GUILD_PERM,
  LAST_CORE_GATEWAY_KEY,
  LAST_SERVER_GATEWAY_KEY,
  MESSAGE_HISTORY_PREFETCH_THRESHOLD_PX,
  MESSAGE_PAGE_SIZE,
  MIC_GAIN_KEY,
  MIC_SENSITIVITY_KEY,
  NOISE_SUPPRESSION_CONFIG_KEY,
  NOISE_SUPPRESSION_KEY,
  NOISE_SUPPRESSION_PRESET_KEY,
  PENDING_INVITE_AUTO_JOIN_KEY,
  PENDING_INVITE_CODE_KEY,
  PINNED_DM_KEY,
  REFRESH_TOKEN_KEY,
  SELF_STATUS_KEY,
  SERVER_VOICE_GATEWAY_PREFS_KEY,
  VOICE_MEMBER_AUDIO_PREFS_KEY,
  VOICE_NOISE_CANCELLATION_MODE_KEY,
  api,
  buildSmartNoiseSuppressionProfile,
  buildFavouriteMediaKey,
  buildPaginatedPath,
  buildSlashCommandTemplate,
  buildUnicodeReactionKey,
  clampProfileCardPosition,
  clampProfileElementRect,
  contentMentionsSelf,
  createBasicFullProfile,
  decodeJwtPayload,
  escapeRegex,
  extensionForMimeType,
  extractFilesFromClipboardData,
  extractHttpUrls,
  ensureFreshMembershipToken,
  formatByteCount,
  formatCallDurationLabel,
  formatMessageDate,
  formatMessageTime,
  getContextMenuPoint,
  getCoreGatewayWsCandidates,
  getDesktopBridge,
  getEmoteQuery,
  getInitials,
  getLastSuccessfulGateway,
  getMentionQuery,
  getMessageDayKey,
  getReactionUserIds,
  getSlashQuery,
  getStoredJson,
  getStoredStringArray,
  getVoiceGatewayWsCandidates,
  groupMessages,
  guessFileNameFromUrl,
  isVoiceDebugEnabled,
  mergeMessagesChronologically,
  messageHasReactionFromUser,
  nodeApi,
  normalizeAttachmentFile,
  normalizeFavouriteMediaUrl,
  normalizeFullProfile,
  normalizeImageUrlInput,
  normalizeVoiceNoiseCancellationMode,
  normalizeNoiseSuppressionConfigForUi,
  normalizeNoiseSuppressionPresetForUi,
  normalizeServerBaseUrl,
  normalizeServerList,
  normalizeServerRecord,
  parseCommandArgs,
  parseCommandArgsByOptions,
  parsePermissionBits,
  playNotificationBeep,
  prioritizeLastSuccessfulGateway,
  profileImageUrl,
  describeApiError,
  rpcActivityFromForm,
  rpcFormFromActivity,
  resolveSlashCommand,
  requestSystemNotificationPermission,
  showSystemNotification,
  isNoiseSuppressionConfigEquivalent,
  splitSlashInput,
  toIsoTimestamp,
  toTimestampMs,
  useThemeCss,
} from "./lib/appCore";

const PANEL_APP_URL =
  import.meta.env.VITE_PANEL_APP_URL || "http://localhost:5175";

const BUILTIN_REACTION_ENTRY_BY_TOKEN = BUILTIN_EMOTE_ENTRIES.reduce(
  (map, entry) => {
    map[entry.name] = entry;
    for (const alias of entry.aliases || []) {
      if (!map[alias]) map[alias] = entry;
    }
    return map;
  },
  {},
);

const BUILTIN_REACTION_ENTRY_BY_VALUE = BUILTIN_EMOTE_ENTRIES.reduce(
  (map, entry) => {
    if (!map.has(entry.value)) map.set(entry.value, entry);
    return map;
  },
  new Map(),
);

function matchesReactionPickerQuery(searchText = "", query = "") {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return true;
  const normalizedText = String(searchText || "").toLowerCase();
  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => normalizedText.includes(token));
}

function mergeKlipyMediaItems(current = [], incoming = []) {
  const merged = [];
  const seen = new Set();
  for (const item of [...current, ...incoming]) {
    const itemType =
      String(item?.type || "").trim().toLowerCase() === "ad" ? "ad" : "media";
    const baseKey = String(
      item?.id || item?.sourceUrl || item?.iframeUrl || item?.pageUrl || "",
    ).trim();
    const key = baseKey ? `${itemType}:${baseKey}` : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export function App() {
  const voiceDebugEnabled = isVoiceDebugEnabled();
  const voiceDebug = (message, context = {}) => {
    if (!voiceDebugEnabled) return;
    console.debug(`[voice-debug] ${message}`, context);
  };
  const storedActiveDmId = localStorage.getItem(ACTIVE_DM_KEY) || "";
  const [accessToken, setAccessToken] = useState(
    localStorage.getItem(ACCESS_TOKEN_KEY) || "",
  );
  const [refreshToken, setRefreshToken] = useState(
    localStorage.getItem(REFRESH_TOKEN_KEY) || "",
  );
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authResetPasswordConfirm, setAuthResetPasswordConfirm] = useState("");
  const [resetPasswordToken, setResetPasswordToken] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [me, setMe] = useState(null);

  const [navMode, setNavMode] = useState("servers");
  const [status, setStatus] = useState("");

  const [servers, setServers] = useState([]);
  const [guilds, setGuilds] = useState([]);
  const [activeServerId, setActiveServerId] = useState("");
  const [activeGuildId, setActiveGuildId] = useState("");
  const [activeChannelId, setActiveChannelId] = useState("");
  const [guildState, setGuildState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [messageReactionPicker, setMessageReactionPicker] = useState(null);
  const [messageReactionPickerQuery, setMessageReactionPickerQuery] =
    useState("");
  const [globalCustomEmoteCatalog, setGlobalCustomEmoteCatalog] = useState([]);
  const [newServerEmoteName, setNewServerEmoteName] = useState("");
  const [newServerEmoteUrl, setNewServerEmoteUrl] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [pendingDmAttachments, setPendingDmAttachments] = useState([]);
  const [invitePendingCode, setInvitePendingCode] = useState(() => {
    try {
      return sessionStorage.getItem(PENDING_INVITE_CODE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [invitePendingAutoJoin, setInvitePendingAutoJoin] = useState(() => {
    try {
      return sessionStorage.getItem(PENDING_INVITE_AUTO_JOIN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [friends, setFriends] = useState([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendAddInput, setFriendAddInput] = useState("");
  const [friendView, setFriendView] = useState("online");

  const [dms, setDms] = useState([]);
  const [activeDmId, setActiveDmId] = useState(storedActiveDmId);
  const [dmText, setDmText] = useState("");

  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    username: "",
    displayName: "",
    bio: "",
    pfpUrl: "",
    bannerUrl: "",
    notificationSoundUrl: "",
  });
  const [fullProfileDraft, setFullProfileDraft] = useState(
    createBasicFullProfile({}),
  );
  const [fullProfileViewer, setFullProfileViewer] = useState(null);
  const [fullProfileViewerMusicPlaying, setFullProfileViewerMusicPlaying] =
    useState(false);
  const [fullProfileDraggingElementId, setFullProfileDraggingElementId] =
    useState("");
  const [profileStudioSelectedElementId, setProfileStudioSelectedElementId] =
    useState("");
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  }));
  const fullProfileDragOffsetRef = useRef({ x: 0, y: 0 });
  const fullProfileElementsRef = useRef([]);
  const fullProfileEditorCanvasRef = useRef(null);
  const fullProfileViewerMusicAudioRef = useRef(null);
  const [rpcForm, setRpcForm] = useState({
    name: "",
    details: "",
    state: "",
    largeImageUrl: "",
    largeImageText: "",
    smallImageUrl: "",
    smallImageText: "",
    button1Label: "",
    button1Url: "",
    button2Label: "",
    button2Url: "",
  });
  const [serverProfileForm, setServerProfileForm] = useState({
    name: "",
    logoUrl: "",
    bannerUrl: "",
  });

  const [newServerName, setNewServerName] = useState("");
  const [newServerBaseUrl, setNewServerBaseUrl] = useState("https://");
  const [newServerLogoUrl, setNewServerLogoUrl] = useState("");
  const [newServerBannerUrl, setNewServerBannerUrl] = useState("");
  const [inviteServerId, setInviteServerId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteJoinUrl, setInviteJoinUrl] = useState("");
  const [inviteCustomCode, setInviteCustomCode] = useState("");
  const [invitePermanent, setInvitePermanent] = useState(false);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [invitePreview, setInvitePreview] = useState(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState("text");
  const [newChannelParentId, setNewChannelParentId] = useState("");
  const [friendRequests, setFriendRequests] = useState({
    incoming: [],
    outgoing: [],
  });
  const [allowFriendRequests, setAllowFriendRequests] = useState(true);

  const [collapsedCategories, setCollapsedCategories] = useState({});

  // ── Private call state ─────────────────────────────────────────────────────
  // incomingCall: set when another user calls you (you haven't answered yet)
  const [incomingCall, setIncomingCall] = useState(null);
  // outgoingCall: set while you're waiting for the other person to pick up
  const [outgoingCall, setOutgoingCall] = useState(null);
  // activePrivateCall: set once both sides are in the call
  const [activePrivateCall, setActivePrivateCall] = useState(null);
  const [privateCallViewOpen, setPrivateCallViewOpen] = useState(false);
  // seconds elapsed since the call connected (driven by useEffect below)
  const [callDuration, setCallDuration] = useState(0);
  // ──────────────────────────────────────────────────────────────────────────

  const [voiceSession, setVoiceSession] = useState({
    guildId: "",
    channelId: "",
  });
  const [isDisconnectingVoice, setIsDisconnectingVoice] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localCameraStream, setLocalCameraStream] = useState(null);
  const [selectedScreenShareProducerId, setSelectedScreenShareProducerId] =
    useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isMicMonitorActive, setIsMicMonitorActive] = useState(false);
  const micMonitorRestoreStateRef = useRef({
    muted: false,
    deafened: false,
    shouldRestore: false,
  });
  const [micGain, setMicGain] = useState(
    Number(localStorage.getItem(MIC_GAIN_KEY) || 100),
  );
  const [micSensitivity, setMicSensitivity] = useState(
    Number(localStorage.getItem(MIC_SENSITIVITY_KEY) || 50),
  );
  const [audioInputDeviceId, setAudioInputDeviceId] = useState(
    localStorage.getItem(AUDIO_INPUT_DEVICE_KEY) || "",
  );
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState(
    localStorage.getItem(AUDIO_OUTPUT_DEVICE_KEY) || "",
  );
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(
    localStorage.getItem(NOISE_SUPPRESSION_KEY) !== "0",
  );
  const [noiseCancellationMode, setNoiseCancellationMode] = useState(() =>
    normalizeVoiceNoiseCancellationMode(
      localStorage.getItem(VOICE_NOISE_CANCELLATION_MODE_KEY) || "smart",
    ),
  );
  const [noiseSuppressionPreset, setNoiseSuppressionPreset] = useState(() => {
    const storedPreset = localStorage.getItem(NOISE_SUPPRESSION_PRESET_KEY);
    return normalizeNoiseSuppressionPresetForUi(
      storedPreset || VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
    );
  });
  const [noiseSuppressionConfig, setNoiseSuppressionConfig] = useState(() => {
    const storedPreset = localStorage.getItem(NOISE_SUPPRESSION_PRESET_KEY);
    const normalizedPreset = normalizeNoiseSuppressionPresetForUi(
      storedPreset || VOICE_NOISE_SUPPRESSION_DEFAULT_PRESET,
    );
    const storedConfig = getStoredJson(NOISE_SUPPRESSION_CONFIG_KEY, null);
    return normalizeNoiseSuppressionConfigForUi(
      storedConfig || {},
      normalizedPreset,
    );
  });
  const [localAudioProcessingInfo, setLocalAudioProcessingInfo] =
    useState(null);
  const smartNoiseSuppressionProfile = useMemo(
    () =>
      buildSmartNoiseSuppressionProfile({
        micGain,
        micSensitivity,
        localAudioProcessingInfo,
      }),
    [micGain, micSensitivity, localAudioProcessingInfo],
  );
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selfStatus, setSelfStatus] = useState(
    localStorage.getItem(SELF_STATUS_KEY) || "online",
  );
  const [showPinned, setShowPinned] = useState(false);
  const [newOfficialServerName, setNewOfficialServerName] = useState("");
  const [newOfficialServerLogoUrl, setNewOfficialServerLogoUrl] = useState("");
  const [newOfficialServerBannerUrl, setNewOfficialServerBannerUrl] =
    useState("");
  const [pinnedServerMessages, setPinnedServerMessages] = useState({});
  const [pinnedDmMessages, setPinnedDmMessages] = useState(
    getStoredJson(PINNED_DM_KEY, {}),
  );
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [moderationMemberId, setModerationMemberId] = useState("");
  const [moderationBanReason, setModerationBanReason] = useState("");
  const [moderationUnbanUserId, setModerationUnbanUserId] = useState("");
  const [moderationBusy, setModerationBusy] = useState(false);
  const [profileCardPosition, setProfileCardPosition] = useState({
    x: 26,
    y: 26,
  });
  const [draggingProfileCard, setDraggingProfileCard] = useState(false);
  const [invertProfileDrag, setInvertProfileDrag] = useState(false);
  const [dmReplyTarget, setDmReplyTarget] = useState(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const [themeStudioTab, setThemeStudioTab] = useState("catalog");
  const [boostStatus, setBoostStatus] = useState(null);
  const [boostLoading, setBoostLoading] = useState(false);
  const [boostUpsell, setBoostUpsell] = useState(null);
  const [boostGiftCode, setBoostGiftCode] = useState("");
  const [boostGiftPreview, setBoostGiftPreview] = useState(null);
  const [boostGiftPrompt, setBoostGiftPrompt] = useState(null);
  const [boostGiftLoading, setBoostGiftLoading] = useState(false);
  const [boostGiftRedeeming, setBoostGiftRedeeming] = useState(false);
  const [boostGiftCheckoutBusy, setBoostGiftCheckoutBusy] = useState(false);
  const [boostGiftSent, setBoostGiftSent] = useState([]);
  const [linkPreviewByUrl, setLinkPreviewByUrl] = useState({});
  const [attachmentPreviewUrlById, setAttachmentPreviewUrlById] = useState({});
  const [favouriteMedia, setFavouriteMedia] = useState([]);
  const [favouriteMediaLoading, setFavouriteMediaLoading] = useState(false);
  const [favouriteMediaModalOpen, setFavouriteMediaModalOpen] = useState(false);
  const [favouriteMediaQuery, setFavouriteMediaQuery] = useState("");
  const [favouriteMediaBusyById, setFavouriteMediaBusyById] = useState({});
  const [favouriteMediaInsertBusyId, setFavouriteMediaInsertBusyId] =
    useState("");
  const [favouriteMediaPreviewUrlById, setFavouriteMediaPreviewUrlById] =
    useState({});
  const [klipyModalOpen, setKlipyModalOpen] = useState(false);
  const [klipyQuery, setKlipyQuery] = useState("");
  const [klipyItems, setKlipyItems] = useState([]);
  const [klipyLoading, setKlipyLoading] = useState(false);
  const [klipyNext, setKlipyNext] = useState("");
  const [klipyInsertBusyId, setKlipyInsertBusyId] = useState("");
  const [expandedMedia, setExpandedMedia] = useState(null);
  const [addServerModalOpen, setAddServerModalOpen] = useState(false);
  const [addServerTab, setAddServerTab] = useState("create");
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [memberContextMenu, setMemberContextMenu] = useState(null);
  const [channelContextMenu, setChannelContextMenu] = useState(null);
  const [categoryContextMenu, setCategoryContextMenu] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [serverPingCounts, setServerPingCounts] = useState({});
  const [memberProfileCard, setMemberProfileCard] = useState(null);
  const [userCache, setUserCache] = useState({});
  const userCacheFetchingRef = useRef(new Set());
  const [themeCss, setThemeCss, themeEnabled, setThemeEnabled] = useThemeCss();
  const [sessions, setSessions] = useState([]);
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activeSessions, setActiveSessions] = useState([
    {
      id: "current",
      device: "Current Device",
      location: "Your Location",
      lastActive: "Now",
      status: "active",
    },
  ]);
  const [lastLoginInfo, setLastLoginInfo] = useState({
    date: new Date().toISOString(),
    device: "Current Device",
    location: "Your Location",
  });
  const [twoFactorSecret, setTwoFactorSecret] = useState("");
  const [twoFactorQRCode, setTwoFactorQRCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [securitySettings, setSecuritySettings] = useState({
    twoFactorEnabled: false,
  });
  const [channelDragId, setChannelDragId] = useState(null);
  const [categoryDragId, setCategoryDragId] = useState(null);
  const [channelPermsChannelId, setChannelPermsChannelId] = useState("");
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const [routePath, setRoutePath] = useState(getAppRouteFromLocation);
  const [downloadsMenuOpen, setDownloadsMenuOpen] = useState(false);
  const [dialogModal, setDialogModal] = useState(null);
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [nodeGatewayConnected, setNodeGatewayConnected] = useState(false);
  const [nodeGatewayServerId, setNodeGatewayServerId] = useState("");
  const [dmNotification, setDmNotification] = useState(null);
  const [voiceStatesByGuild, setVoiceStatesByGuild] = useState({});
  const [voiceSpeakingByGuild, setVoiceSpeakingByGuild] = useState({});
  const [remoteVideoStreamsByProducerId, setRemoteVideoStreamsByProducerId] =
    useState({});
  const [voiceMemberAudioPrefsByGuild, setVoiceMemberAudioPrefsByGuild] =
    useState(getStoredJson(VOICE_MEMBER_AUDIO_PREFS_KEY, {}));
  const [serverVoiceGatewayPrefs, setServerVoiceGatewayPrefs] = useState(
    getStoredJson(SERVER_VOICE_GATEWAY_PREFS_KEY, {}),
  );
  const [nodeGatewayUnavailableByServer, setNodeGatewayUnavailableByServer] =
    useState({});
  const [clientExtensionCatalog, setClientExtensionCatalog] = useState([]);
  const [serverExtensionCatalog, setServerExtensionCatalog] = useState([]);
  const [installedServerExtensions, setInstalledServerExtensions] = useState(
    [],
  );
  const [serverExtensionsLoading, setServerExtensionsLoading] = useState(false);
  const [serverExtensionBusyById, setServerExtensionBusyById] = useState({});
  const [enabledClientExtensions, setEnabledClientExtensions] = useState(
    getStoredStringArray(CLIENT_EXTENSIONS_ENABLED_KEY),
  );
  const [clientExtensionDevMode, setClientExtensionDevMode] = useState(
    localStorage.getItem(CLIENT_EXTENSIONS_DEV_MODE_KEY) === "1",
  );
  const [clientExtensionDevUrls, setClientExtensionDevUrls] = useState(
    getStoredStringArray(CLIENT_EXTENSIONS_DEV_URLS_KEY),
  );
  const [newClientExtensionDevUrl, setNewClientExtensionDevUrl] = useState("");
  const [clientExtensionLoadState, setClientExtensionLoadState] = useState({});
  const [serverExtensionCommands, setServerExtensionCommands] = useState([]);
  const [slashSelectionIndex, setSlashSelectionIndex] = useState(0);
  const [emoteSelectionIndex, setEmoteSelectionIndex] = useState(0);
  const [serverAdminIntent, setServerAdminIntent] = useState({
    nonce: 0,
    serverId: "",
    guildId: "",
    tab: "overview",
    channelId: "",
    channelAction: "",
  });

  function applyNoiseSuppressionPreset(nextPresetRaw) {
    const nextPreset = normalizeNoiseSuppressionPresetForUi(nextPresetRaw);
    setNoiseCancellationMode("advanced");
    setNoiseSuppressionPreset(nextPreset);
    if (nextPreset === "custom") return;
    setNoiseSuppressionConfig(
      normalizeNoiseSuppressionConfigForUi({}, nextPreset),
    );
  }

  function updateNoiseSuppressionConfig(patch = {}) {
    setNoiseCancellationMode("advanced");
    setNoiseSuppressionPreset("custom");
    setNoiseSuppressionConfig((current) =>
      normalizeNoiseSuppressionConfigForUi(
        {
          ...(current || {}),
          ...(patch || {}),
        },
        noiseSuppressionPreset,
      ),
    );
  }

  function applySmartNoiseSuppressionProfile({ ensureEnabled = true } = {}) {
    const nextPreset = smartNoiseSuppressionProfile.preset;
    const nextConfig = normalizeNoiseSuppressionConfigForUi(
      smartNoiseSuppressionProfile.config,
      nextPreset,
    );
    setNoiseCancellationMode("smart");
    if (ensureEnabled) setNoiseSuppressionEnabled(true);
    setNoiseSuppressionPreset(nextPreset);
    setNoiseSuppressionConfig((current) =>
      isNoiseSuppressionConfigEquivalent(current, nextConfig)
        ? current
        : nextConfig,
    );
  }

  const messagesRef = useRef(null);
  const gatewayWsRef = useRef(null);
  const gatewayHeartbeatRef = useRef(null);
  const nodeGatewayWsRef = useRef(null);
  const nodeGatewayHeartbeatRef = useRef(null);
  const nodeGatewayReadyRef = useRef(false);
  const voiceGatewayCandidatesRef = useRef([]);
  const voiceSpeakingDetectorRef = useRef({
    audioCtx: null,
    stream: null,
    analyser: null,
    timer: null,
    lastSpeaking: false,
  });
  const pendingVoiceEventsRef = useRef(new Map());
  const voiceSessionStartedAtRef = useRef(0);
  const voiceServerDesyncMissesRef = useRef(0);
  const voiceRecoveringRef = useRef(false);
  const voiceLastRecoverAttemptAtRef = useRef(0);
  const selfUserIdRef = useRef("");
  // Private call gateway — a standalone WS to the official node (or core proxy)
  // used exclusively while a 1:1 call is active. Kept separate so it doesn't
  // disrupt the normal server node gateway.
  const privateCallGatewayWsRef = useRef(null);
  const privateCallGatewayReadyRef = useRef(false);
  const privateCallGatewayHeartbeatRef = useRef(null);
  const activePrivateCallRef = useRef(activePrivateCall);
  const voiceMemberAudioPrefsByGuildRef = useRef(voiceMemberAudioPrefsByGuild);
  voiceMemberAudioPrefsByGuildRef.current = voiceMemberAudioPrefsByGuild;
  activePrivateCallRef.current = activePrivateCall;
  selfUserIdRef.current = me?.id || "";
  const voiceSfuRef = useRef(null);
  if (!voiceSfuRef.current) {
    voiceSfuRef.current = createSfuVoiceClient({
      getSelfUserId: () => selfUserIdRef.current,
      sendDispatch: (type, data) => sendNodeVoiceDispatch(type, data),
      waitForEvent: waitForVoiceEvent,
      debugLog: voiceDebug,
      onLocalAudioProcessingInfo: (info) => {
        setLocalAudioProcessingInfo(info || null);
      },
      onRemoteVideoAdded: ({ producerId, userId, stream, source }) => {
        if (!producerId || !stream) return;
        setRemoteVideoStreamsByProducerId((prev) => ({
          ...prev,
          [producerId]: {
            producerId,
            userId: userId || "",
            stream,
            source: source === "screen" ? "screen" : "camera",
          },
        }));
      },
      onRemoteAudioAdded: ({ guildId, userId }) => {
        const uid = String(userId || "").trim();
        if (!guildId || !uid) return;
        const guildPrefs =
          voiceMemberAudioPrefsByGuildRef.current?.[guildId] || {};
        const pref = guildPrefs[uid] || { muted: false, volume: 100 };
        voiceSfuRef.current?.setUserAudioPreference(uid, pref);
      },
      onRemoteVideoRemoved: ({ producerId }) => {
        if (!producerId) return;
        setRemoteVideoStreamsByProducerId((prev) => {
          if (!prev[producerId]) return prev;
          const next = { ...prev };
          delete next[producerId];
          return next;
        });
      },
      onCameraStateChange: (nextState) => {
        setIsCameraEnabled(!!nextState);
      },
      onScreenShareStateChange: (nextState) => {
        setIsScreenSharing(!!nextState);
      },
      onLocalCameraStreamChange: (stream) => {
        setLocalCameraStream(stream || null);
      },
    });
  }
  const selfStatusRef = useRef(selfStatus);
  selfStatusRef.current = selfStatus;
  const notificationSoundUrlRef = useRef("");
  notificationSoundUrlRef.current =
    profileImageUrl(profile?.notificationSoundUrl || "") || "";

  function resolveNotificationSoundUrl(value = "") {
    return profileImageUrl(value) || "";
  }

  function getPresence(userId) {
    if (!userId) return "offline";
    if (userId === me?.id) return selfStatus;
    const status = String(
      presenceByUserId[userId]?.status ?? "offline",
    ).toLowerCase();
    return status === "invisible" ? "offline" : status;
  }
  function getRichPresence(userId) {
    if (!userId) return null;
    return presenceByUserId[userId]?.richPresence ?? null;
  }
  function getCustomStatus(userId) {
    if (!userId) return "";
    return String(presenceByUserId[userId]?.customStatus || "").trim();
  }
  function shouldDeliverDeviceNotification() {
    if (selfStatusRef.current === "dnd") return false;
    if (typeof document === "undefined") return true;
    if (document.hidden) return true;
    if (typeof document.hasFocus === "function") {
      return !document.hasFocus();
    }
    return false;
  }
  function notifyDesktopDevice(input) {
    if (!shouldDeliverDeviceNotification()) return;
    void showSystemNotification(input);
  }
  function truncateUiText(value, maxLength = 60) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }
  function getActivitySummary(
    userId,
    { fallback = "", maxLength = 60 } = {},
  ) {
    const rich = getRichPresence(userId);
    const richParts = [rich?.details, rich?.state]
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    const richLabel =
      richParts.join(" - ") ||
      String(rich?.name || rich?.largeImageText || "").trim();
    const customStatus = getCustomStatus(userId);
    const statusText =
      typeof fallback === "string" && fallback.trim()
        ? fallback.trim()
        : presenceLabel(getPresence(userId));
    return truncateUiText(richLabel || customStatus || statusText, maxLength);
  }
  const presenceLabels = {
    online: "Online",
    idle: "Idle",
    dnd: "Do Not Disturb",
    offline: "Offline",
    invisible: "Invisible",
  };
  function presenceLabel(status) {
    return presenceLabels[status] || status || "Offline";
  }
  function presenceIndicatorClass(status) {
    const normalized = String(status || "offline").toLowerCase();
    if (normalized === "online") return "presence-online";
    if (normalized === "idle") return "presence-idle";
    if (normalized === "dnd") return "presence-dnd";
    return "presence-offline";
  }
  function renderPresenceAvatar({ userId, username, pfpUrl, size = 28 }) {
    const avatarStatus = getPresence(userId);
    const seed = String(userId || username || "?");
    const seedCode = seed.charCodeAt(0) || 0;
    const resolvedUrl = profileImageUrl(pfpUrl);
    return (
      <div
        className="avatar-with-presence"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        {resolvedUrl && (
          <img
            src={resolvedUrl}
            alt={username}
            className="avatar-presence-image"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              const fallback = event.currentTarget.parentElement?.querySelector(
                ".avatar-presence-fallback",
              );
              if (fallback) fallback.style.display = "grid";
            }}
          />
        )}
        <div
          className="avatar-presence-fallback"
          style={{
            background: `hsl(${Math.abs(seedCode * 7) % 360}, 70%, 60%)`,
            display: resolvedUrl ? "none" : "grid",
          }}
        >
          {String(username || "?")
            .substring(0, 1)
            .toUpperCase()}
        </div>
        <span
          className={`presence-indicator-dot ${presenceIndicatorClass(avatarStatus)}`}
        />
      </div>
    );
  }

  function getSocialPrimaryName(userLike, fallback = "Unknown user") {
    return (
      userLike?.displayName ||
      userLike?.username ||
      userLike?.name ||
      fallback
    );
  }

  function getSocialSecondaryLabel(
    userLike,
    userId,
    { fallback = "", maxLength = 60 } = {},
  ) {
    const activity = getActivitySummary(userId, {
      fallback,
      maxLength:
        userLike?.displayName &&
        (userLike?.username || userLike?.name) &&
        userLike.displayName !== (userLike.username || userLike.name)
          ? Math.max(24, maxLength - 12)
          : maxLength,
    });
    const username = String(userLike?.username || userLike?.name || "").trim();
    if (userLike?.displayName && username && userLike.displayName !== username) {
      return truncateUiText(`@${username} · ${activity}`, maxLength);
    }
    return activity;
  }

  const dmMessagesRef = useRef(null);
  const composerInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const dmAttachmentInputRef = useRef(null);
  const dmComposerInputRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const isServerAtBottomRef = useRef(true);
  const lastDmMessageCountRef = useRef(0);
  const lastServerMessageCountRef = useRef(0);
  const linkPreviewFetchInFlightRef = useRef(new Set());
  const attachmentPreviewFetchInFlightRef = useRef(new Set());
  const attachmentPreviewUrlByIdRef = useRef({});
  const favouriteMediaPreviewFetchInFlightRef = useRef(new Set());
  const favouriteMediaPreviewUrlByIdRef = useRef({});
  const klipyRequestSeqRef = useRef(0);
  const autoJoinInviteAttemptRef = useRef("");
  const previousDmIdRef = useRef("");
  const previousServerChannelIdRef = useRef("");
  const previousSelectedServerIdRef = useRef("");
  const dmScrollPositionsRef = useRef({});
  const serverScrollPositionsRef = useRef({});
  const activeServerMessagesRef = useRef([]);
  const activeDmMessagesRef = useRef([]);
  const serverHistoryHasMoreByChannelRef = useRef({});
  const dmHistoryHasMoreByThreadRef = useRef({});
  const serverHistoryLoadingByChannelRef = useRef({});
  const dmHistoryLoadingByThreadRef = useRef({});
  const dialogResolverRef = useRef(null);
  const dialogInputRef = useRef(null);
  const activeServerIdRef = useRef("");
  const activeChannelIdRef = useRef("");
  const activeGuildIdRef = useRef("");
  const activeDmIdRef = useRef("");
  const profileCardDragOffsetRef = useRef({ x: 0, y: 0 });
  const profileCardDragPointerIdRef = useRef(null);
  const memberProfilePopoutRef = useRef(null);
  const downloadMenuRef = useRef(null);
  const preferredDownloadTarget = useMemo(
    () => getPreferredDownloadTarget(DOWNLOAD_TARGETS),
    [],
  );
  const mobileDownloadTarget = useMemo(
    () => getMobileDownloadTarget(DOWNLOAD_TARGETS),
    [],
  );
  const deviceDownloadContext = useMemo(() => getDeviceDownloadContext(), []);
  const isDesktopRuntime = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.location.protocol === "file:" || shouldSkipLandingPage();
  }, []);
  const isMobileVisitor = deviceDownloadContext.isMobile && !isDesktopRuntime;
  const isAndroidVisitor = deviceDownloadContext.isAndroid && !isDesktopRuntime;
  const loadedClientExtensionIdsRef = useRef(new Set());
  const desktopSessionLoadedRef = useRef(false);
  const extensionPanelsRef = useRef([]);
  const serversRef = useRef([]);
  const dragEasterEggBufferRef = useRef("");
  const storageScope = me?.id || "anonymous";

  function resolveDialog(value) {
    const resolver = dialogResolverRef.current;
    dialogResolverRef.current = null;
    setDialogModal(null);
    if (resolver) resolver(value);
  }

  function getProfileCardClampOptions() {
    const rect = memberProfilePopoutRef.current?.getBoundingClientRect?.();
    return {
      width:
        Number.isFinite(Number(rect?.width)) && Number(rect.width) > 0
          ? Number(rect.width)
          : 320,
      height:
        Number.isFinite(Number(rect?.height)) && Number(rect.height) > 0
          ? Number(rect.height)
          : 280,
    };
  }

  function openDialog({
    type = "alert",
    title = "OpenCom",
    message = "",
    defaultValue = "",
    confirmLabel = "OK",
    cancelLabel = "Cancel",
  }) {
    if (dialogResolverRef.current) {
      // If another dialog was open, safely resolve it first.
      dialogResolverRef.current(type === "confirm" ? false : null);
      dialogResolverRef.current = null;
    }
    setDialogModal({
      type,
      title,
      message: String(message || ""),
      value: String(defaultValue || ""),
      confirmLabel,
      cancelLabel,
    });
    return new Promise((resolve) => {
      dialogResolverRef.current = resolve;
    });
  }

  async function promptText(message, defaultValue = "") {
    return openDialog({
      type: "prompt",
      title: "Input",
      message,
      defaultValue,
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
    });
  }

  async function confirmDialog(message, title = "Confirm") {
    const result = await openDialog({
      type: "confirm",
      title,
      message,
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
    });
    return !!result;
  }

  async function alertDialog(message, title = "Notice") {
    await openDialog({
      type: "alert",
      title,
      message,
      confirmLabel: "OK",
    });
  }

  function getMessageReportIssueText(issue) {
    const path = Array.isArray(issue?.path) ? issue.path : [];
    const label = String(path[path.length - 1] || "request")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();
    const prettyLabel = label
      ? label.charAt(0).toUpperCase() + label.slice(1)
      : "Request";
    return `${prettyLabel}: ${String(issue?.message || "Invalid value.")}`;
  }

  function normalizeAttachmentForReport(attachment) {
    if (!attachment || typeof attachment !== "object") return null;
    const fileName = String(attachment.fileName || attachment.name || "").trim();
    const contentType = String(
      attachment.contentType || attachment.content_type || "",
    ).trim();
    const url = String(attachment.url || "").trim();
    if (!fileName && !contentType && !url) return null;
    return {
      fileName: fileName.slice(0, 180),
      contentType: contentType.slice(0, 120),
      url: url.slice(0, 512),
    };
  }

  function serializeMessageForReport(message) {
    if (!message || typeof message !== "object") return null;
    const attachments = Array.isArray(message.attachments)
      ? message.attachments
          .map((attachment) => normalizeAttachmentForReport(attachment))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    return {
      messageId: String(message.id || "").trim(),
      authorUserId: String(message.authorId || message.author_id || "").trim(),
      authorName: String(
        message.author || message.authorName || message.displayName || "",
      ).trim(),
      createdAt: String(message.createdAt || message.created_at || "").trim(),
      content: String(message.content || "").trim(),
      attachments,
    };
  }

  function buildMessageReportPayload(message) {
    if (!message?.id || !message?.authorId) return null;
    const sourceMessages =
      message.kind === "dm" ? activeDm?.messages || [] : messages || [];
    const targetId = String(message.id || "").trim();
    const messageIndex = sourceMessages.findIndex(
      (entry) => String(entry?.id || "").trim() === targetId,
    );
    const nearbyMessages =
      messageIndex >= 0
        ? sourceMessages.slice(
            Math.max(0, messageIndex - 2),
            Math.min(sourceMessages.length, messageIndex + 3),
          )
        : [message];
    const selectedSnapshot = serializeMessageForReport(message);
    const serializedNearby = nearbyMessages
      .map((entry) => serializeMessageForReport(entry))
      .filter(Boolean);
    const nearbyReportedMessage =
      serializedNearby.find((entry) => entry.messageId === targetId) || null;
    if (!selectedSnapshot && !nearbyReportedMessage) return null;
    const reportedMessage = {
      ...(nearbyReportedMessage || {}),
      ...(selectedSnapshot || {}),
      attachments:
        selectedSnapshot?.attachments?.length
          ? selectedSnapshot.attachments
          : nearbyReportedMessage?.attachments || [],
    };

    const contextMessages = serializedNearby.filter(
      (entry) => entry.messageId !== reportedMessage.messageId,
    );

    return {
      reportedUserId: String(message.authorId || "").trim(),
      reportedUsername: String(
        message.authorUsername || message.author || "",
      ).trim(),
      source:
        message.kind === "server"
          ? {
              kind: "server",
              serverId: activeGuildId || activeGuild?.id || "",
              serverName: activeServer?.name || activeGuild?.name || "",
              channelId: activeChannelId || activeChannel?.id || "",
              channelName: activeChannel?.name || "",
            }
          : {
              kind: "dm",
              dmThreadId: activeDm?.id || message.threadId || "",
              dmTitle: activeDm?.name || String(message.author || "").trim(),
            },
      reportedMessage,
      contextMessages,
    };
  }

  async function reportMessage(message) {
    if (!accessToken) {
      setStatus("Sign in to report messages.");
      return;
    }

    const payload = buildMessageReportPayload(message);
    if (!payload) {
      setStatus("This message could not be reported.");
      return;
    }

    const note = await promptText(
      `Add any extra context for support about ${message.author || "this message"}. Leave it blank to just send the message snapshot and nearby context.\n\nUpdates will be sent to ${me?.email || "your account email"}.`,
      "",
    );
    if (note === null) return;

    setStatus("Sending message report...");
    try {
      const result = await api("/v1/support/message-reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          ...payload,
          reportNote: String(note || "").trim() || undefined,
        }),
      });

      const ticketReference = result?.ticket?.reference || "support";
      const deliveryState = String(result?.emailDelivery?.state || "").trim();
      const emailTail =
        deliveryState === "sent"
          ? ` Updates were emailed to ${me?.email || "your account email"}.`
          : deliveryState === "unavailable"
            ? " The report was saved, but email updates are not configured yet."
            : deliveryState === "failed"
              ? " The report was saved, but the email update failed."
              : "";

      setStatus(
        result?.mode === "appended"
          ? `Added this report to ticket ${ticketReference}.${emailTail}`
          : `Created support ticket ${ticketReference} for this report.${emailTail}`,
      );
    } catch (error) {
      if (error?.message === "CANNOT_REPORT_SELF") {
        setStatus("You cannot report your own message.");
        return;
      }
      if (error?.message === "REPORTED_USER_NOT_FOUND") {
        setStatus("That account could not be found anymore.");
        return;
      }
      if (error?.message === "VALIDATION_ERROR" && error?.issues?.length) {
        setStatus(getMessageReportIssueText(error.issues[0]));
        return;
      }
      setStatus(describeApiError(error, "Failed to report the message."));
    }
  }

  function navigateAppRoute(nextRoute, { replace = false } = {}) {
    writeAppRoute(nextRoute, { replace });
    setRoutePath(getAppRouteFromLocation());
  }

  useEffect(() => {
    serversRef.current = servers;
  }, [servers]);

  useEffect(() => {
    if (!dialogModal || dialogModal.type !== "prompt") return;
    const timer = window.setTimeout(() => {
      dialogInputRef.current?.focus();
      dialogInputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dialogModal]);

  useEffect(() => {
    return () => {
      if (dialogResolverRef.current) {
        dialogResolverRef.current(null);
        dialogResolverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    attachmentPreviewUrlByIdRef.current = attachmentPreviewUrlById || {};
  }, [attachmentPreviewUrlById]);

  useEffect(() => {
    favouriteMediaPreviewUrlByIdRef.current = favouriteMediaPreviewUrlById || {};
  }, [favouriteMediaPreviewUrlById]);

  useEffect(() => {
    if (!accessToken) {
      setFavouriteMedia([]);
      setFavouriteMediaModalOpen(false);
      setFavouriteMediaQuery("");
      return;
    }
    loadFavouriteMedia().catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    const onPopState = () => setRoutePath(getAppRouteFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.protocol === "file:") return;
    if (isInviteJoinPath(window.location.pathname || "")) return;
    if (isBoostGiftPath(window.location.pathname || "")) return;
    const canonical = normalizeAppPath(window.location.pathname || "");
    if (canonical !== (window.location.pathname || "")) {
      navigateAppRoute(canonical, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    if (routePath !== APP_ROUTE_LOGIN) return;
    navigateAppRoute(APP_ROUTE_CLIENT, { replace: true });
  }, [accessToken, routePath]);

  useEffect(() => {
    if (!accessToken || !settingsOpen || settingsTab !== "billing") return;
    loadBoostStatus().catch(() => {});
    loadSentBoostGifts().catch(() => {});
  }, [accessToken, settingsOpen, settingsTab]);

  useEffect(() => {
    if (!accessToken) {
      setGlobalCustomEmoteCatalog([]);
      return;
    }
    loadGlobalEmoteCatalog({ quiet: true }).catch(() => {});
  }, [accessToken, servers.length]);

  useEffect(() => {
    if (!accessToken || !settingsOpen || settingsTab !== "server") return;
    const settingsServer =
      servers.find((server) => server.id === activeServerId) || null;
    if (!settingsServer || !(settingsServer.roles || []).includes("owner"))
      return;
    if (boostStatus != null) return;
    loadBoostStatus().catch(() => {});
  }, [accessToken, settingsOpen, settingsTab, servers, activeServerId, boostStatus]);

  useEffect(() => {
    if (accessToken) return;
    if (routePath !== APP_ROUTE_CLIENT) return;
    navigateAppRoute(APP_ROUTE_LOGIN, { replace: true });
  }, [accessToken, routePath]);

  useEffect(() => {
    function closeDownloadsMenuOnOutsideClick(event) {
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(event.target)
      ) {
        setDownloadsMenuOpen(false);
      }
    }

    function closeDownloadsMenuOnEscape(event) {
      if (event.key === "Escape") setDownloadsMenuOpen(false);
    }

    document.addEventListener("mousedown", closeDownloadsMenuOnOutsideClick);
    document.addEventListener("keydown", closeDownloadsMenuOnEscape);

    return () => {
      document.removeEventListener(
        "mousedown",
        closeDownloadsMenuOnOutsideClick,
      );
      document.removeEventListener("keydown", closeDownloadsMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      CLIENT_EXTENSIONS_ENABLED_KEY,
      JSON.stringify(enabledClientExtensions),
    );
  }, [enabledClientExtensions]);

  useEffect(() => {
    try {
      if (invitePendingCode)
        sessionStorage.setItem(PENDING_INVITE_CODE_KEY, invitePendingCode);
      else sessionStorage.removeItem(PENDING_INVITE_CODE_KEY);
    } catch {}
  }, [invitePendingCode]);

  useEffect(() => {
    try {
      if (invitePendingAutoJoin)
        sessionStorage.setItem(PENDING_INVITE_AUTO_JOIN_KEY, "1");
      else sessionStorage.removeItem(PENDING_INVITE_AUTO_JOIN_KEY);
    } catch {}
  }, [invitePendingAutoJoin]);

  useEffect(() => {
    localStorage.setItem(
      CLIENT_EXTENSIONS_DEV_MODE_KEY,
      clientExtensionDevMode ? "1" : "0",
    );
  }, [clientExtensionDevMode]);

  useEffect(() => {
    localStorage.setItem(
      CLIENT_EXTENSIONS_DEV_URLS_KEY,
      JSON.stringify(clientExtensionDevUrls),
    );
  }, [clientExtensionDevUrls]);

  useEffect(() => {
    const active = servers.find((server) => server.id === activeServerId);
    if (!active) {
      setServerProfileForm({ name: "", logoUrl: "", bannerUrl: "" });
      return;
    }
    setServerProfileForm({
      name: active.name || "",
      logoUrl: active.logoUrl || "",
      bannerUrl: active.bannerUrl || "",
    });
  }, [activeServerId, servers]);

  useEffect(() => {
    if (!accessToken || !me?.id) {
      setClientExtensionCatalog([]);
      setServerExtensionCatalog([]);
      return;
    }

    api("/v1/extensions/catalog", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((data) => {
        setClientExtensionCatalog(data.clientExtensions || []);
        setServerExtensionCatalog(data.serverExtensions || []);
      })
      .catch(() => {
        setClientExtensionCatalog([]);
        setServerExtensionCatalog([]);
      });
  }, [accessToken, me?.id]);

  async function loadServerExtensionCommands(serverIdOverride = "") {
    const selectedServerId = String(serverIdOverride || activeServerId || "");
    const selectedServer =
      servers.find((server) => server.id === selectedServerId) || null;
    if (!accessToken || !selectedServer) {
      setServerExtensionCommands([]);
      return [];
    }

    try {
      const data = await nodeApi(
        selectedServer.baseUrl,
        "/v1/extensions/commands",
        selectedServer.membershipToken,
      );
      const commands = Array.isArray(data.commands) ? data.commands : [];
      setServerExtensionCommands(commands);
      return commands;
    } catch {
      setServerExtensionCommands([]);
      return [];
    }
  }

  async function loadInstalledServerExtensions(serverIdOverride = "") {
    const selectedServerId = String(serverIdOverride || activeServerId || "");
    if (!accessToken || !selectedServerId) {
      setInstalledServerExtensions([]);
      return [];
    }

    setServerExtensionsLoading(true);
    try {
      const data = await api(`/v1/servers/${selectedServerId}/extensions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const extensions = Array.isArray(data.extensions) ? data.extensions : [];
      setInstalledServerExtensions(extensions);
      return extensions;
    } catch {
      setInstalledServerExtensions([]);
      return [];
    } finally {
      setServerExtensionsLoading(false);
    }
  }

  useEffect(() => {
    const selectedServer =
      servers.find((server) => server.id === activeServerId) || null;
    if (!accessToken || !selectedServer) {
      setServerExtensionCommands([]);
      return;
    }
    loadServerExtensionCommands(selectedServer.id).catch(() => {});
  }, [accessToken, activeServerId, servers]);

  useEffect(() => {
    const selectedServer =
      servers.find((server) => server.id === activeServerId) || null;
    if (!accessToken || !selectedServer) {
      setInstalledServerExtensions([]);
      return;
    }
    loadInstalledServerExtensions(selectedServer.id).catch(() => {});
  }, [accessToken, activeServerId, servers]);

  useEffect(() => {
    if (!accessToken || !activeServerId) return;
    const timer = window.setInterval(() => {
      loadServerExtensionCommands(activeServerId).catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [accessToken, activeServerId]);

  useEffect(() => {
    if (!accessToken || servers.length === 0) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const currentServers = serversRef.current || [];
        const updates = await Promise.all(
          currentServers.map(async (server) => {
            try {
              const refreshed = await api(
                `/v1/servers/${server.id}/membership-token`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}` },
                },
              );
              return {
                id: server.id,
                membershipToken: refreshed.membershipToken,
              };
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const byId = new Map(
          updates
            .filter(Boolean)
            .map((item) => [item.id, item.membershipToken]),
        );
        if (byId.size) {
          setServers((current) =>
            current.map((server) => {
              const token = byId.get(server.id);
              return token ? { ...server, membershipToken: token } : server;
            }),
          );
        }
      } catch {
        // no-op
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 8 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, servers.length]);

  useEffect(() => {
    if (!refreshToken) return;
    let cancelled = false;

    const refreshAuth = async () => {
      const refreshed = await refreshAccessTokenWithRefreshToken().catch(
        () => null,
      );
      if (cancelled) return;
      if (!refreshed?.accessToken) {
        setStatus("Session expired. Please sign in again.");
        setAccessToken("");
        setRefreshToken("");
      }
    };

    const timer = window.setInterval(refreshAuth, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshToken]);

  useEffect(() => {
    setSlashSelectionIndex(0);
  }, [messageText, serverExtensionCommands]);

  useEffect(() => {
    setEmoteSelectionIndex(0);
  }, [navMode, messageText, dmText, guildState?.emotes, globalCustomEmoteCatalog]);

  async function loadClientExtensionSource({
    extensionId,
    extensionName,
    devUrl,
  }) {
    if (devUrl) {
      const response = await fetch(devUrl);
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return response.text();
    }

    const response = await fetch(
      `${CORE_API}/v1/extensions/client/${encodeURIComponent(extensionId)}/source`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return response.text();
  }

  async function loadClientExtensionRuntime({
    extensionId,
    extensionName,
    devUrl,
  }) {
    const source = await loadClientExtensionSource({
      extensionId,
      extensionName,
      devUrl,
    });
    const blob = new Blob([source], { type: "application/javascript" });
    const moduleUrl = URL.createObjectURL(blob);

    try {
      const extensionModule = await import(/* @vite-ignore */ moduleUrl);
      const activate =
        extensionModule?.activateClient || extensionModule?.default;
      if (typeof activate !== "function")
        throw new Error("Missing activateClient export");

      const extensionApi = {
        registerPanel: (panel) => {
          extensionPanelsRef.current.push(panel);
        },
        coreApi: (path, options = {}) =>
          api(path, {
            ...options,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              ...(options.headers || {}),
            },
          }),
        getSelf: () => me,
        setStatus,
        voice: {
          getState: () => ({
            connected: !!voiceSession.channelId,
            guildId: voiceSession.guildId || "",
            channelId: voiceSession.channelId || "",
            muted: !!isMuted,
            deafened: !!isDeafened,
            cameraEnabled: !!isCameraEnabled,
            screenSharing: !!isScreenSharing,
          }),
          join: async (channelId) => {
            const channel = (channels || []).find(
              (item) => item?.id === channelId && item?.type === "voice",
            );
            if (!channel) throw new Error("VOICE_CHANNEL_NOT_FOUND");
            await joinVoiceChannel(channel);
          },
          leave: async () => {
            await leaveVoiceChannel();
          },
          setMuted: (nextMuted) => setIsMuted(!!nextMuted),
          setDeafened: (nextDeafened) => setIsDeafened(!!nextDeafened),
          toggleScreenShare: async () => {
            await toggleScreenShare();
          },
          toggleCamera: async () => {
            await toggleCamera();
          },
          onStateChange: (handler) => {
            if (typeof handler !== "function") return () => {};
            const listener = (event) => {
              try {
                handler(event?.detail || {});
              } catch {}
            };
            window.addEventListener("opencom-voice-state-change", listener);
            return () =>
              window.removeEventListener(
                "opencom-voice-state-change",
                listener,
              );
          },
        },
      };

      await Promise.resolve(activate(extensionApi));
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  }

  useEffect(() => {
    if (!accessToken) return;

    const requested = [
      ...enabledClientExtensions.map((id) => ({
        id,
        extensionId: id,
        extensionName: id,
        devUrl: null,
      })),
      ...(clientExtensionDevMode
        ? clientExtensionDevUrls.map((url, index) => ({
            id: `dev:${url}`,
            extensionId: `dev-extension-${index + 1}`,
            extensionName: `Developer Extension ${index + 1}`,
            devUrl: url,
          }))
        : []),
    ];

    requested.forEach((entry) => {
      if (loadedClientExtensionIdsRef.current.has(entry.id)) return;
      loadedClientExtensionIdsRef.current.add(entry.id);
      setClientExtensionLoadState((current) => ({
        ...current,
        [entry.id]: "loading",
      }));

      loadClientExtensionRuntime(entry)
        .then(() =>
          setClientExtensionLoadState((current) => ({
            ...current,
            [entry.id]: "loaded",
          })),
        )
        .catch((error) =>
          setClientExtensionLoadState((current) => ({
            ...current,
            [entry.id]: `error:${error.message}`,
          })),
        );
    });
  }, [
    accessToken,
    enabledClientExtensions,
    clientExtensionDevMode,
    clientExtensionDevUrls,
    me,
  ]);

  function toggleClientExtension(extensionId, enabled) {
    setEnabledClientExtensions((current) => {
      if (enabled)
        return current.includes(extensionId)
          ? current
          : [...current, extensionId];
      return current.filter((id) => id !== extensionId);
    });
  }

  async function refreshServerExtensions(serverIdOverride = "") {
    const selectedServerId = String(serverIdOverride || activeServerId || "");
    if (!selectedServerId) return;
    await Promise.all([
      loadInstalledServerExtensions(selectedServerId),
      loadServerExtensionCommands(selectedServerId),
    ]);
  }

  async function toggleServerExtension(extensionId, enabled) {
    const selectedServerId = String(activeServerId || "");
    if (!accessToken || !selectedServerId || !extensionId) return;

    setServerExtensionBusyById((current) => ({
      ...current,
      [extensionId]: true,
    }));
    try {
      await api(
        `/v1/servers/${selectedServerId}/extensions/${encodeURIComponent(extensionId)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ enabled: !!enabled }),
        },
      );
      await refreshServerExtensions(selectedServerId);
      setStatus(
        `${enabled ? "Enabled" : "Disabled"} server extension: ${extensionId}`,
      );
    } catch (error) {
      setStatus(`Server extension update failed: ${error.message}`);
    } finally {
      setServerExtensionBusyById((current) => {
        const next = { ...current };
        delete next[extensionId];
        return next;
      });
    }
  }

  function addClientDevExtensionUrl() {
    const trimmed = newClientExtensionDevUrl.trim();
    if (!trimmed) return;
    setClientExtensionDevUrls((current) =>
      current.includes(trimmed) ? current : [...current, trimmed],
    );
    setNewClientExtensionDevUrl("");
  }

  // Resolve usernames and profile pictures from core for guild members and message authors
  useEffect(() => {
    if (!accessToken) return;
    const ids = new Set();
    (guildState?.members || []).forEach((m) => m.id && ids.add(m.id));
    messages.forEach((msg) => {
      const id = msg.author_id || msg.authorId;
      if (id && !String(id).startsWith("ext:")) ids.add(id);
    });
    if (me?.id) ids.add(me.id);
    const toFetch = [...ids].filter(
      (id) => !userCache[id] && !userCacheFetchingRef.current.has(id),
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => userCacheFetchingRef.current.add(id));
    Promise.all(
      toFetch.map((id) =>
        fetch(`${CORE_API}/v1/users/${id}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((results) => {
      toFetch.forEach((id) => userCacheFetchingRef.current.delete(id));
      setUserCache((prev) => {
        const next = { ...prev };
        toFetch.forEach((id, i) => {
          const data = results[i];
          if (
            data &&
            (data.username != null ||
              data.displayName != null ||
              data.pfpUrl != null)
          ) {
            next[id] = {
              username: data.username ?? data.displayName ?? id,
              displayName: data.displayName ?? data.username ?? id,
              pfpUrl: data.pfpUrl ?? null,
            };
          }
        });
        return next;
      });
    });
  }, [accessToken, guildState?.members, messages, me?.id]);

  // Seed current user into cache when we have profile
  useEffect(() => {
    if (!me?.id || !profile) return;
    setUserCache((prev) => ({
      ...prev,
      [me.id]: {
        username: profile.username ?? me.username ?? me.id,
        displayName:
          profile.displayName ?? profile.username ?? me.username ?? me.id,
        pfpUrl: profile.pfpUrl ?? null,
      },
    }));
  }, [
    me?.id,
    me?.username,
    profile?.username,
    profile?.displayName,
    profile?.pfpUrl,
  ]);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || null,
    [servers, activeServerId],
  );
  const activeGuild = useMemo(
    () => guilds.find((guild) => guild.id === activeGuildId) || null,
    [guilds, activeGuildId],
  );
  const workingGuildId = useMemo(
    () =>
      activeGuildId ||
      activeGuild?.id ||
      guildState?.guild?.id ||
      activeServer?.defaultGuildId ||
      "",
    [
      activeGuildId,
      activeGuild?.id,
      guildState?.guild?.id,
      activeServer?.defaultGuildId,
    ],
  );
  const voiceConnectedChannelId = voiceSession.channelId;
  const voiceConnectedGuildId = voiceSession.guildId;
  const isInVoiceChannel = !!voiceConnectedChannelId;
  const voiceConnectedServer = useMemo(
    () =>
      servers.find(
        (server) => server.defaultGuildId === voiceConnectedGuildId,
      ) || null,
    [servers, voiceConnectedGuildId],
  );
  const nodeGatewayTargetServer = useMemo(() => {
    if (voiceConnectedServer?.baseUrl && voiceConnectedServer?.membershipToken)
      return voiceConnectedServer;
    return activeServer;
  }, [voiceConnectedServer, activeServer]);
  const nodeGatewayConnectedForActiveServer = !!(
    nodeGatewayConnected &&
    activeServer?.id &&
    nodeGatewayServerId === activeServer.id
  );
  const channels = guildState?.channels || [];
  const voiceConnectedChannelName = useMemo(() => {
    if (!voiceConnectedChannelId) return "";
    const connectedChannel = channels.find(
      (channel) => channel.id === voiceConnectedChannelId,
    );
    return connectedChannel?.name || voiceConnectedChannelId;
  }, [channels, voiceConnectedChannelId]);
  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) || null,
    [channels, activeChannelId],
  );
  const activeDm = useMemo(
    () => dms.find((dm) => dm.id === activeDmId) || null,
    [dms, activeDmId],
  );
  const activeMessageReactionTarget = useMemo(() => {
    const pickerMessageId = String(messageReactionPicker?.messageId || "").trim();
    if (!pickerMessageId) return null;
    const sourceMessages =
      messageReactionPicker?.kind === "dm" ? activeDm?.messages || [] : messages;
    return (
      sourceMessages.find(
        (message) => String(message?.id || "").trim() === pickerMessageId,
      ) || null
    );
  }, [activeDm?.messages, messageReactionPicker, messages]);
  const activeDmPrivateCallId = useMemo(() => {
    const activeParticipantId = activeDm?.participantId || "";
    if (!activeParticipantId) return null;

    if (
      activePrivateCall?.callId &&
      activePrivateCall?.otherUserId === activeParticipantId
    ) {
      return activePrivateCall.callId;
    }

    if (
      outgoingCall?.callId &&
      outgoingCall?.calleeId === activeParticipantId
    ) {
      return outgoingCall.callId;
    }

    if (
      incomingCall?.callId &&
      incomingCall?.callerId === activeParticipantId
    ) {
      return incomingCall.callId;
    }

    return null;
  }, [
    activePrivateCall?.callId,
    activePrivateCall?.otherUserId,
    activeDm?.participantId,
    outgoingCall?.callId,
    outgoingCall?.calleeId,
    incomingCall?.callId,
    incomingCall?.callerId,
  ]);
  function startActiveDmCall() {
    if (!activeDm?.participantId || activeDm?.isNoReply) return;
    const friend = friends.find((f) => f.id === activeDm.participantId);
    initiatePrivateCall(
      activeDm.participantId,
      activeDm.name,
      friend?.pfp_url ?? null,
    );
  }
  const activeDmHasLivePrivateCall =
    !!activePrivateCall?.callId &&
    !!activeDm?.participantId &&
    activePrivateCall?.otherUserId === activeDm.participantId;
  const activeComposerText = navMode === "dms" ? dmText : messageText;
  const activeComposerInputRef =
    navMode === "dms" ? dmComposerInputRef : composerInputRef;
  const showServerVoiceStage = navMode === "servers" && activeChannel?.type === "voice";
  const showPrivateCallStage =
    navMode === "dms" && activeDmHasLivePrivateCall && privateCallViewOpen;
  const showPrivateCallDock =
    navMode === "dms" && activeDmHasLivePrivateCall && !privateCallViewOpen;
  activeServerMessagesRef.current = messages;
  activeDmMessagesRef.current = activeDm?.messages || [];
  const installedServerExtensionById = useMemo(
    () =>
      new Map(
        (installedServerExtensions || []).map((item) => [
          item?.extensionId,
          item,
        ]),
      ),
    [installedServerExtensions],
  );
  const serverExtensionsForDisplay = useMemo(() => {
    const catalog = Array.isArray(serverExtensionCatalog)
      ? serverExtensionCatalog
      : [];
    const merged = catalog.map((ext) => ({
      ...ext,
      installed: installedServerExtensionById.get(ext.id) || null,
      enabled: !!installedServerExtensionById.get(ext.id)?.enabled,
    }));
    const knownIds = new Set(merged.map((item) => item.id));
    for (const installed of installedServerExtensions || []) {
      if (!installed?.extensionId || knownIds.has(installed.extensionId))
        continue;
      const manifest = installed.manifest || {};
      merged.push({
        id: installed.extensionId,
        name: manifest.name || installed.extensionId,
        version: manifest.version || "0.1.0",
        description: manifest.description || "",
        installed,
        enabled: !!installed.enabled,
      });
    }
    return merged.sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || "")),
    );
  }, [
    serverExtensionCatalog,
    installedServerExtensionById,
    installedServerExtensions,
  ]);

  const myGuildPermissions = useMemo(() => {
    const roles = guildState?.roles || [];
    const myRoleIds = new Set(guildState?.me?.roleIds || []);
    let total = 0n;
    for (const role of roles) {
      if (!role) continue;
      if (role.is_everyone || myRoleIds.has(role.id)) {
        total |= parsePermissionBits(role.permissions);
      }
    }
    return total;
  }, [guildState?.roles, guildState?.me?.roleIds]);

  const hasGuildPermission = useMemo(() => {
    return (bit) => {
      if (
        (myGuildPermissions & GUILD_PERM.ADMINISTRATOR) ===
        GUILD_PERM.ADMINISTRATOR
      )
        return true;
      return (myGuildPermissions & bit) === bit;
    };
  }, [myGuildPermissions]);

  const canManageServer = useMemo(() => {
    if (!activeServer) return false;
    const coreManage =
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin");
    return (
      coreManage ||
      hasGuildPermission(GUILD_PERM.MANAGE_CHANNELS) ||
      hasGuildPermission(GUILD_PERM.MANAGE_ROLES)
    );
  }, [activeServer, hasGuildPermission]);

  const canKickMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.KICK_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canBanMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.BAN_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canServerMuteMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.MUTE_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canServerDeafenMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.DEAFEN_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canMoveVoiceMembers = useMemo(() => {
    if (!activeServer) return false;
    return (
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      hasGuildPermission(GUILD_PERM.MOVE_MEMBERS)
    );
  }, [activeServer, hasGuildPermission]);

  const canDeleteServerMessages = useMemo(() => {
    if (!activeServer) return false;
    const coreStaff =
      (activeServer.roles || []).includes("owner") ||
      (activeServer.roles || []).includes("platform_admin") ||
      (activeServer.roles || []).includes("admin") ||
      (activeServer.roles || []).includes("server_admin");
    return coreStaff || hasGuildPermission(GUILD_PERM.MANAGE_CHANNELS);
  }, [activeServer, hasGuildPermission]);

  const canModerateMembers = canKickMembers || canBanMembers;
  const hasBoostForFullProfiles = !!(
    boostStatus?.active ||
    profile?.boostActive ||
    profile?.badges?.includes?.("boost")
  );
  const profileStudioCanvasMinHeight = useMemo(
    () => Math.max(420, Math.min(900, Math.round(viewportSize.height - 300))),
    [viewportSize.height],
  );
  const profileStudioPreviewProfile = useMemo(
    () => ({
      ...(profile || {}),
      username:
        typeof profileForm?.username === "string"
          ? profileForm.username
          : (profile?.username ?? me?.username ?? ""),
      displayName:
        typeof profileForm?.displayName === "string"
          ? profileForm.displayName
          : (profile?.displayName ?? ""),
      bio:
        typeof profileForm?.bio === "string"
          ? profileForm.bio
          : (profile?.bio ?? ""),
      pfpUrl:
        typeof profileForm?.pfpUrl === "string"
          ? profileForm.pfpUrl
          : (profile?.pfpUrl ?? ""),
      bannerUrl:
        typeof profileForm?.bannerUrl === "string"
          ? profileForm.bannerUrl
          : (profile?.bannerUrl ?? ""),
      fullProfile: fullProfileDraft,
    }),
    [me?.username, profile, profileForm, fullProfileDraft],
  );
  const selectedProfileStudioElement = useMemo(
    () =>
      (fullProfileDraft?.elements || []).find(
        (item) => item.id === profileStudioSelectedElementId,
      ) || null,
    [fullProfileDraft?.elements, profileStudioSelectedElementId],
  );
  const canAccessServerAdminPanel = useMemo(() => {
    return servers.some((server) => {
      const roles = Array.isArray(server?.roles)
        ? server.roles.map((role) => String(role || "").toLowerCase())
        : [];
      return (
        roles.includes("owner") ||
        roles.includes("platform_admin") ||
        roles.includes("admin") ||
        roles.includes("server_admin")
      );
    });
  }, [servers]);

  const sortedChannels = useMemo(
    () =>
      [...(channels || [])]
        .filter(Boolean)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [channels],
  );
  const categoryChannels = useMemo(
    () =>
      sortedChannels.filter(
        (channel) => channel && channel.type === "category",
      ),
    [sortedChannels],
  );
  const currentServerCustomEmotes = useMemo(() => {
    const seen = new Set();
    const catalog = [];
    for (const emote of guildState?.emotes || []) {
      const name = String(emote?.name || "").trim().toLowerCase();
      const imageUrl = String(emote?.imageUrl || emote?.image_url || "").trim();
      if (!name || !imageUrl || seen.has(name)) continue;
      seen.add(name);
      catalog.push({
        id: emote.id || `server:${name}`,
        name,
        imageUrl,
        scopeLabel: "This server",
      });
    }
    return catalog;
  }, [guildState?.emotes]);
  const serverEmoteByName = useMemo(() => {
    const map = new Map();
    for (const emote of currentServerCustomEmotes) {
      const name = String(emote?.name || "").toLowerCase();
      if (!name || map.has(name)) continue;
      map.set(name, emote);
    }
    return map;
  }, [currentServerCustomEmotes]);
  const globalUsableCustomEmotes = useMemo(() => {
    const seen = new Set();
    const catalog = [];
    for (const emote of globalCustomEmoteCatalog || []) {
      const name = String(emote?.name || "").trim().toLowerCase();
      const imageUrl = String(emote?.imageUrl || emote?.image_url || "").trim();
      if (!name || !imageUrl || seen.has(name) || !emote?.canUse) continue;
      seen.add(name);
      catalog.push({
        id: emote.id || `global:${name}`,
        name,
        imageUrl,
        serverName: emote.serverName || "",
        guildName: emote.guildName || "",
        scopeLabel: emote.serverName
          ? `Global · ${emote.serverName}`
          : "Global custom",
      });
    }
    return catalog;
  }, [globalCustomEmoteCatalog]);
  const currentServerCustomEmoteByName = useMemo(
    () => new Map(currentServerCustomEmotes.map((emote) => [emote.name, emote])),
    [currentServerCustomEmotes],
  );
  const globalUsableCustomEmoteByName = useMemo(
    () => new Map(globalUsableCustomEmotes.map((emote) => [emote.name, emote])),
    [globalUsableCustomEmotes],
  );
  const globalRenderableCustomEmoteByName = useMemo(() => {
    const map = new Map();
    for (const emote of globalCustomEmoteCatalog || []) {
      const name = String(emote?.name || "").trim().toLowerCase();
      const imageUrl = String(emote?.imageUrl || emote?.image_url || "").trim();
      if (!name || !imageUrl || map.has(name)) continue;
      map.set(name, {
        id: emote.id || `global:${name}`,
        name,
        imageUrl,
      });
    }
    return map;
  }, [globalCustomEmoteCatalog]);

  const filteredFriends = useMemo(() => {
    const query = friendQuery.trim().toLowerCase();
    if (!query) return friends;
    return friends.filter(
      (friend) =>
        friend.username.toLowerCase().includes(query) ||
        friend.id.includes(query),
    );
  }, [friendQuery, friends]);

  const memberList = useMemo(() => {
    const listed = guildState?.members || [];
    if (listed.length) return listed;

    const members = new Map();
    for (const message of messages) {
      const id = message.author_id || message.authorId;
      if (!id || members.has(id)) continue;
      members.set(id, {
        id,
        username: message.username || id,
        status: "offline",
        pfp_url: message.pfp_url || null,
        roleIds: [],
      });
    }

    if (me?.id && !members.has(me.id)) {
      members.set(me.id, {
        id: me.id,
        username: me.username || me.id,
        status: "offline",
        pfp_url: profile?.pfpUrl || null,
        roleIds: guildState?.me?.roleIds || [],
      });
    }

    return Array.from(members.values());
  }, [guildState, messages, me, profile]);

  const resolvedMemberList = useMemo(
    () =>
      memberList.map((m) => ({
        ...m,
        username:
          userCache[m.id]?.displayName ||
          userCache[m.id]?.username ||
          m.username,
        pfp_url: userCache[m.id]?.pfpUrl ?? m.pfp_url,
      })),
    [memberList, userCache],
  );

  const mentionSuggestions = useMemo(() => {
    const mention = getMentionQuery(messageText);
    if (!mention || navMode !== "servers") return [];
    const candidateNames = [
      "everyone",
      ...resolvedMemberList.map((member) => member.username || ""),
    ]
      .map((name) => name.trim())
      .filter(Boolean);
    const uniqueNames = Array.from(new Set(candidateNames));
    if (!mention.query) return uniqueNames.slice(0, 8);
    return uniqueNames
      .filter((name) => name.toLowerCase().startsWith(mention.query))
      .slice(0, 8);
  }, [messageText, navMode, resolvedMemberList]);

  const slashQuery = useMemo(() => {
    if (navMode !== "servers") return null;
    return getSlashQuery(messageText);
  }, [messageText, navMode]);

  const slashCommandSuggestions = useMemo(() => {
    if (slashQuery == null) return [];
    const catalog = [...serverExtensionCommands].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!slashQuery) return catalog.slice(0, 10);
    return catalog
      .filter((command) => command.name.toLowerCase().includes(slashQuery))
      .slice(0, 10);
  }, [slashQuery, serverExtensionCommands]);
  const showingSlash = slashQuery != null;

  const emoteQuery = useMemo(() => {
    if (navMode !== "servers" && navMode !== "dms") return null;
    return getEmoteQuery(activeComposerText);
  }, [activeComposerText, navMode]);

  const emoteSuggestions = useMemo(() => {
    if (emoteQuery == null) return [];

    const catalog = [];
    const seenNames = new Set();

    if (navMode === "servers") {
      for (const emote of currentServerCustomEmotes) {
        const name = String(emote?.name || "").trim().toLowerCase();
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
        catalog.push({
          id: emote.id || `custom:${name}`,
          name,
          type: "custom",
          imageUrl: emote.imageUrl || "",
          value: "",
          searchText: name,
          scopeLabel: "This server",
        });
      }
    }

    for (const emote of globalUsableCustomEmotes) {
      const name = String(emote?.name || "").trim().toLowerCase();
      if (!name || seenNames.has(name)) continue;
      seenNames.add(name);
      catalog.push({
        id: emote.id || `custom:${name}`,
        name,
        type: "custom",
        imageUrl: emote.imageUrl || "",
        value: "",
        searchText: [
          name,
          String(emote.serverName || "").toLowerCase(),
          String(emote.guildName || "").toLowerCase(),
        ]
          .filter(Boolean)
          .join(" "),
        scopeLabel: emote.scopeLabel || "Global custom",
      });
    }

    for (const emote of BUILTIN_EMOTE_ENTRIES) {
      const name = String(emote.name || "").trim().toLowerCase();
      if (seenNames.has(name)) continue;
      seenNames.add(name);
      catalog.push({
        id: `builtin:${name}`,
        name,
        type: "builtin",
        imageUrl: "",
        value: emote.value,
        searchText: [name, ...(emote.aliases || [])].join(" "),
      });
    }

    if (!emoteQuery.query) return catalog.slice(0, 10);

    return catalog
      .filter((emote) => String(emote.searchText || emote.name).includes(emoteQuery.query))
      .slice(0, 10);
  }, [emoteQuery, navMode, currentServerCustomEmotes, globalUsableCustomEmotes]);

  const customPickerSections = useMemo(() => {
    const sections = [];
    const currentServerNames = new Set(
      currentServerCustomEmotes.map((emote) => emote.name),
    );

    if (navMode === "servers" && currentServerCustomEmotes.length > 0) {
      sections.push({
        id: "current-server",
        heading: "This server",
        items: currentServerCustomEmotes,
      });
    }

    const globalItems = globalUsableCustomEmotes.filter(
      (emote) => !currentServerNames.has(emote.name),
    );
    if (globalItems.length > 0) {
      sections.push({
        id: "global-custom",
        heading: "Global custom emotes",
        items: globalItems,
      });
    }

    return sections;
  }, [navMode, currentServerCustomEmotes, globalUsableCustomEmotes]);
  const reactionPickerBuiltinSections = useMemo(
    () =>
      BUILTIN_EMOTE_CATEGORIES.map((category) => ({
        id: category.id,
        heading: category.label,
        items: category.items.map((emote) => ({
          id: `builtin:${category.id}:${emote.name}`,
          type: "builtin",
          name: emote.name,
          value: emote.value,
          aliases: emote.aliases || [],
          categoryLabel: category.label,
          searchText: [
            emote.name,
            ...(emote.aliases || []),
            emote.value,
            category.label,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        })),
      })),
    [],
  );
  const reactionPickerSearchResults = useMemo(() => {
    const trimmedQuery = String(messageReactionPickerQuery || "").trim();
    if (!trimmedQuery) return [];

    const results = [];

    for (const section of customPickerSections) {
      for (const emote of section.items || []) {
        const searchText = [
          emote.name,
          emote.scopeLabel,
          emote.serverName,
          emote.guildName,
          section.heading,
        ]
          .filter(Boolean)
          .join(" ");
        if (!matchesReactionPickerQuery(searchText, trimmedQuery)) continue;
        results.push({
          ...emote,
          type: "custom",
          categoryLabel: section.heading,
        });
      }
    }

    for (const section of reactionPickerBuiltinSections) {
      for (const emote of section.items || []) {
        if (!matchesReactionPickerQuery(emote.searchText, trimmedQuery))
          continue;
        results.push(emote);
      }
    }

    return results.slice(0, 160);
  }, [
    customPickerSections,
    messageReactionPickerQuery,
    reactionPickerBuiltinSections,
  ]);

  const showingEmoteSuggestions = emoteQuery != null;

  const memberByMentionToken = useMemo(() => {
    const map = new Map();
    for (const member of resolvedMemberList) {
      if (!member?.id) continue;
      map.set(String(member.id).toLowerCase(), member);
      if (member.username)
        map.set(String(member.username).toLowerCase(), member);
    }
    return map;
  }, [resolvedMemberList]);

  const memberNameById = useMemo(
    () =>
      new Map(resolvedMemberList.map((member) => [member.id, member.username])),
    [resolvedMemberList],
  );

  const voiceIdentityByUserId = useMemo(() => {
    const map = new Map();

    for (const member of resolvedMemberList) {
      if (!member?.id) continue;
      map.set(member.id, {
        username: member.username || member.id,
        pfpUrl: member.pfp_url ? profileImageUrl(member.pfp_url) : null,
        roleIds: member.roleIds || [],
      });
    }

    for (const friend of friends) {
      if (!friend?.id || map.has(friend.id)) continue;
      map.set(friend.id, {
        username: friend.username || friend.id,
        pfpUrl: friend.pfp_url ? profileImageUrl(friend.pfp_url) : null,
        roleIds: [],
      });
    }

    for (const dm of dms) {
      const participantId = dm?.participantId || "";
      if (!participantId || map.has(participantId)) continue;
      map.set(participantId, {
        username: dm.name || participantId,
        pfpUrl: dm.pfp_url ? profileImageUrl(dm.pfp_url) : null,
        roleIds: [],
      });
    }

    if (me?.id) {
      map.set(me.id, {
        username:
          profile?.displayName || profile?.username || me.username || "You",
        pfpUrl: profile?.pfpUrl ? profileImageUrl(profile.pfpUrl) : null,
        roleIds: [],
      });
    }

    return map;
  }, [
    resolvedMemberList,
    friends,
    dms,
    me?.id,
    me?.username,
    profile?.displayName,
    profile?.username,
    profile?.pfpUrl,
  ]);

  const mergedVoiceStates = useMemo(() => {
    const base = guildState?.voiceStates || [];
    if (!activeGuildId) return base;
    const live = voiceStatesByGuild[activeGuildId] || {};
    if (!Object.keys(live).length) return base;
    const byUser = new Map(base.map((vs) => [vs.userId, vs]));
    for (const [userId, state] of Object.entries(live)) {
      if (!state?.channelId) byUser.delete(userId);
      else
        byUser.set(userId, {
          userId,
          channelId: state.channelId,
          muted: !!state.muted,
          deafened: !!state.deafened,
        });
    }
    return Array.from(byUser.values());
  }, [guildState?.voiceStates, voiceStatesByGuild, activeGuildId]);

  const isVoiceSessionSynced = useMemo(() => {
    if (!me?.id || !voiceConnectedGuildId || !voiceConnectedChannelId)
      return false;
    const liveSelfState = voiceStatesByGuild[voiceConnectedGuildId]?.[me.id];
    if (liveSelfState?.channelId)
      return liveSelfState.channelId === voiceConnectedChannelId;
    if (activeGuildId === voiceConnectedGuildId) {
      const mergedSelfState = mergedVoiceStates.find(
        (vs) => vs.userId === me.id,
      );
      return mergedSelfState?.channelId === voiceConnectedChannelId;
    }
    return false;
  }, [
    me?.id,
    voiceConnectedGuildId,
    voiceConnectedChannelId,
    voiceStatesByGuild,
    activeGuildId,
    mergedVoiceStates,
  ]);

  const voiceMembersByChannel = useMemo(() => {
    const map = new Map();
    for (const vs of mergedVoiceStates) {
      if (!vs?.channelId || !vs?.userId) continue;
      const member = resolvedMemberList.find((item) => item.id === vs.userId);
      if (!map.has(vs.channelId)) map.set(vs.channelId, []);
      map.get(vs.channelId).push({
        id: vs.userId,
        userId: vs.userId,
        username: memberNameById.get(vs.userId) || vs.userId,
        pfp_url: member?.pfp_url || null,
        roleIds: member?.roleIds || [],
        muted: !!vs.muted,
        deafened: !!vs.deafened,
      });
    }
    return map;
  }, [mergedVoiceStates, memberNameById, resolvedMemberList]);

  const getVoiceParticipantsForContext = useMemo(
    () => (guildId, channelId) => {
      const normalizedGuildId = String(guildId || "").trim();
      const normalizedChannelId = String(channelId || "").trim();
      if (!normalizedGuildId || !normalizedChannelId) return [];

      const byUserId = new Map();
      const fallbackStates =
        normalizedGuildId === activeGuildId ? mergedVoiceStates : [];

      for (const state of fallbackStates) {
        if (state?.channelId !== normalizedChannelId || !state?.userId) continue;
        byUserId.set(state.userId, state);
      }

      for (const state of Object.values(voiceStatesByGuild[normalizedGuildId] || {})) {
        if (state?.channelId !== normalizedChannelId || !state?.userId) continue;
        byUserId.set(state.userId, state);
      }

      return Array.from(byUserId.values())
        .map((state) => {
          const identity = voiceIdentityByUserId.get(state.userId) || null;
          const username =
            identity?.username ||
            memberNameById.get(state.userId) ||
            (state.userId === me?.id
              ? profile?.displayName || profile?.username || me?.username || "You"
              : state.userId);
          return {
            userId: state.userId,
            username,
            pfpUrl: identity?.pfpUrl || null,
            muted: !!state.muted,
            deafened: !!state.deafened,
            speaking: !!voiceSpeakingByGuild[normalizedGuildId]?.[state.userId],
            isSelf: state.userId === me?.id,
          };
        })
        .sort((left, right) => {
          if (!!left.speaking !== !!right.speaking)
            return left.speaking ? -1 : 1;
          if (!!left.isSelf !== !!right.isSelf) return left.isSelf ? 1 : -1;
          return String(left.username || "").localeCompare(
            String(right.username || ""),
          );
        });
    },
    [
      activeGuildId,
      mergedVoiceStates,
      voiceStatesByGuild,
      voiceIdentityByUserId,
      memberNameById,
      me?.id,
      me?.username,
      profile?.displayName,
      profile?.username,
      voiceSpeakingByGuild,
    ],
  );
  const remoteVideoStreams = useMemo(
    () => Object.values(remoteVideoStreamsByProducerId),
    [remoteVideoStreamsByProducerId],
  );
  const remoteScreenShares = useMemo(
    () =>
      remoteVideoStreams.filter((stream) => String(stream?.source) === "screen"),
    [remoteVideoStreams],
  );
  const remoteCameraStreams = useMemo(
    () =>
      remoteVideoStreams.filter((stream) => String(stream?.source) === "camera"),
    [remoteVideoStreams],
  );
  const enrichedRemoteScreenShares = useMemo(
    () =>
      remoteScreenShares.map((share) => {
        const identity = voiceIdentityByUserId.get(share.userId) || null;
        return {
          ...share,
          userName: identity?.username || share.userId || "Screen Share",
          userPfp: identity?.pfpUrl || null,
        };
      }),
    [remoteScreenShares, voiceIdentityByUserId],
  );
  const enrichedRemoteCameraStreams = useMemo(
    () =>
      remoteCameraStreams.map((camera) => {
        const identity = voiceIdentityByUserId.get(camera.userId) || null;
        return {
          ...camera,
          userName: identity?.username || camera.userId || "Camera",
          userPfp: identity?.pfpUrl || null,
        };
      }),
    [remoteCameraStreams, voiceIdentityByUserId],
  );
  const remoteCameraByUserId = useMemo(() => {
    const map = new Map();
    enrichedRemoteCameraStreams.forEach((camera) => {
      if (!camera.userId || map.has(camera.userId)) return;
      map.set(camera.userId, camera);
    });
    return map;
  }, [enrichedRemoteCameraStreams]);
  const selectedRemoteScreenShare = useMemo(() => {
    if (!enrichedRemoteScreenShares.length) return null;
    return (
      enrichedRemoteScreenShares.find(
        (share) => share.producerId === selectedScreenShareProducerId,
      ) || enrichedRemoteScreenShares[0]
    );
  }, [enrichedRemoteScreenShares, selectedScreenShareProducerId]);
  const liveCameraCount =
    enrichedRemoteCameraStreams.length + (isCameraEnabled ? 1 : 0);

  const isViewingConnectedServerVoice =
    activeChannel?.type === "voice" &&
    activeChannel?.id === voiceConnectedChannelId &&
    activeGuildId === voiceConnectedGuildId;

  function attachCameraStreamsToParticipants(participants = []) {
    return participants.map((participant) => {
      const remoteCamera =
        remoteCameraByUserId.get(participant.userId) || null;
      const selfCameraStream =
        participant.userId === me?.id && isCameraEnabled ? localCameraStream : null;
      return {
        ...participant,
        videoStream: selfCameraStream || remoteCamera?.stream || null,
        hasCamera: !!(selfCameraStream || remoteCamera?.stream),
      };
    });
  }

  const activeVoiceStageParticipants = useMemo(() => {
    if (activeChannel?.type !== "voice") return [];
    return attachCameraStreamsToParticipants(
      getVoiceParticipantsForContext(activeGuildId, activeChannel.id),
    );
  }, [
    activeChannel?.id,
    activeChannel?.type,
    activeGuildId,
    getVoiceParticipantsForContext,
    isCameraEnabled,
    localCameraStream,
    me?.id,
    remoteCameraByUserId,
  ]);

  const privateCallParticipants = useMemo(() => {
    if (!activePrivateCall?.channelId || !activePrivateCall?.guildId) return [];
    return attachCameraStreamsToParticipants(
      getVoiceParticipantsForContext(
        activePrivateCall.guildId,
        activePrivateCall.channelId,
      ),
    );
  }, [
    activePrivateCall?.channelId,
    activePrivateCall?.guildId,
    getVoiceParticipantsForContext,
    isCameraEnabled,
    localCameraStream,
    me?.id,
    remoteCameraByUserId,
  ]);
  const fullProfileViewerHasMusicElement = useMemo(() => {
    const elements = fullProfileViewer?.fullProfile?.elements;
    return (
      Array.isArray(elements) &&
      elements.some(
        (element) => String(element?.type || "").toLowerCase() === "music",
      )
    );
  }, [fullProfileViewer?.fullProfile?.elements]);
  const fullProfileViewerHasPlayableMusic = useMemo(
    () =>
      fullProfileViewerHasMusicElement &&
      !!String(fullProfileViewer?.fullProfile?.music?.url || "").trim(),
    [
      fullProfileViewerHasMusicElement,
      fullProfileViewer?.fullProfile?.music?.url,
    ],
  );
  const activeVoiceMemberAudioPrefs = useMemo(() => {
    if (!activeGuildId) return {};
    const scoped = voiceMemberAudioPrefsByGuild?.[activeGuildId];
    return scoped && typeof scoped === "object" ? scoped : {};
  }, [voiceMemberAudioPrefsByGuild, activeGuildId]);

  const groupedChannelSections = useMemo(() => {
    const categories = categoryChannels.map((category) => ({
      category,
      channels: sortedChannels.filter(
        (channel) =>
          channel.parent_id === category.id && channel.type !== "category",
      ),
    }));

    const uncategorized = sortedChannels.filter(
      (channel) => !channel.parent_id && channel.type !== "category",
    );

    return [
      ...categories,
      ...(uncategorized.length
        ? [
            {
              category: { id: "uncategorized", name: "Channels" },
              channels: uncategorized,
            },
          ]
        : []),
    ];
  }, [categoryChannels, sortedChannels]);

  const groupedServerMessages = useMemo(
    () =>
      groupMessages(
        messages,
        (message) => {
          const id = message.author_id || message.authorId;
          return memberNameById.get(id) || id || "Unknown";
        },
        (message) => message.created_at || message.createdAt,
        (message) => message.author_id || message.authorId || "unknown",
        (message) => {
          const id = message.author_id || message.authorId;
          return userCache[id]?.pfpUrl ?? message.pfp_url ?? null;
        },
      ),
    [messages, memberNameById, userCache],
  );

  const groupedDmMessages = useMemo(
    () =>
      groupMessages(
        activeDm?.messages || [],
        (message) => message.author || "Unknown",
        (message) => message.createdAt,
        (message) => message.authorId || "unknown",
        (message) => message.pfp_url || null,
      ),
    [activeDm],
  );

  const activePinnedServerMessages = useMemo(
    () => pinnedServerMessages[activeChannelId] || [],
    [pinnedServerMessages, activeChannelId],
  );
  const activePinnedDmMessages = useMemo(
    () => pinnedDmMessages[activeDmId] || [],
    [pinnedDmMessages, activeDmId],
  );
  const voiceStateByUserId = useMemo(() => {
    const map = new Map();
    for (const item of mergedVoiceStates || []) {
      if (!item?.userId) continue;
      map.set(item.userId, item);
    }
    return map;
  }, [mergedVoiceStates]);

  function getVoiceMemberAudioPref(userId) {
    const id = String(userId || "").trim();
    const pref = activeVoiceMemberAudioPrefs[id] || {};
    const volume = Number(pref.volume);
    return {
      muted: !!pref.muted,
      volume: Number.isFinite(volume)
        ? Math.max(0, Math.min(100, volume))
        : 100,
    };
  }

  function setVoiceMemberAudioPref(userId, patch = {}) {
    const id = String(userId || "").trim();
    if (!id || !activeGuildId) return;
    setVoiceMemberAudioPrefsByGuild((current) => {
      const guildPrefs = current?.[activeGuildId] || {};
      const existing = guildPrefs[id] || { muted: false, volume: 100 };
      const next = {
        muted: patch.muted === undefined ? !!existing.muted : !!patch.muted,
        volume:
          patch.volume === undefined
            ? Number.isFinite(Number(existing.volume))
              ? Math.max(0, Math.min(100, Number(existing.volume)))
              : 100
            : Math.max(0, Math.min(100, Number(patch.volume))),
      };
      return {
        ...(current || {}),
        [activeGuildId]: {
          ...guildPrefs,
          [id]: next,
        },
      };
    });
  }

  async function promptSetVoiceMemberLocalVolume(userId) {
    const current = getVoiceMemberAudioPref(userId);
    const raw = await promptText(
      "Set local user volume (0-100):",
      String(current.volume),
    );
    if (raw == null) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setStatus("Invalid volume value.");
      return;
    }
    const clamped = Math.max(0, Math.min(100, Math.round(parsed)));
    setVoiceMemberAudioPref(userId, { volume: clamped });
    setStatus(`Local voice volume set to ${clamped}%.`);
  }
  const activeServerVoiceGatewayPref = useMemo(() => {
    if (!activeServerId) return { mode: "core", customUrl: "" };
    const pref = serverVoiceGatewayPrefs[activeServerId] || {};
    return {
      mode: pref.mode === "server" ? "server" : "core",
      customUrl: typeof pref.customUrl === "string" ? pref.customUrl : "",
    };
  }, [activeServerId, serverVoiceGatewayPrefs]);
  const favouriteMediaByKey = useMemo(() => {
    const byKey = new Map();
    for (const item of favouriteMedia) {
      const key = buildFavouriteMediaKey(item?.sourceKind, item?.sourceUrl);
      if (!key) continue;
      byKey.set(key, item);
    }
    return byKey;
  }, [favouriteMedia]);
  const filteredFavouriteMedia = useMemo(() => {
    const query = String(favouriteMediaQuery || "")
      .trim()
      .toLowerCase();
    if (!query) return favouriteMedia;
    return favouriteMedia.filter((item) =>
      [
        item?.fileName,
        item?.title,
        item?.contentType,
        item?.pageUrl,
        item?.sourceUrl,
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [favouriteMedia, favouriteMediaQuery]);
  const klipySaveStateByItemId = useMemo(() => {
    const next = {};
    for (const item of klipyItems) {
      if (String(item?.type || "").trim().toLowerCase() === "ad") continue;
      const itemKey = String(item?.id || item?.sourceUrl || "").trim();
      if (!itemKey) continue;
      const favouriteKey = buildFavouriteMediaKey("external_url", item?.sourceUrl);
      const existing = favouriteKey ? favouriteMediaByKey.get(favouriteKey) : null;
      next[itemKey] = {
        saved: !!existing,
        busy:
          !!favouriteMediaBusyById[favouriteKey] ||
          (existing?.id ? !!favouriteMediaBusyById[existing.id] : false),
      };
    }
    return next;
  }, [klipyItems, favouriteMediaByKey, favouriteMediaBusyById]);

  async function refreshSocialData(token = accessToken) {
    if (!token) return;
    const [friendsData, dmsData, requestData, socialSettingsData] =
      await Promise.all([
        api("/v1/social/friends", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        api("/v1/social/dms", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        api("/v1/social/requests", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        api("/v1/social/settings", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

    setFriends(friendsData.friends || []);
    let nextDms = [];
    setDms((current) => {
      const previous = new Map(current.map((item) => [item.id, item]));
      nextDms = (dmsData.dms || []).map((item) => ({
        ...item,
        messages: previous.get(item.id)?.messages || [],
      }));
      return nextDms;
    });

    // Preserve current DM selection if it still exists, otherwise find last DM with messages
    if (!nextDms.some((item) => item.id === activeDmId)) {
      const dmWithMessages = nextDms.find(
        (dm) => dm.messages && dm.messages.length > 0,
      );
      const nextActiveDmId = dmWithMessages?.id || nextDms[0]?.id || "";
      if (nextActiveDmId) {
        setActiveDmId(nextActiveDmId);
        localStorage.setItem(ACTIVE_DM_KEY, nextActiveDmId);
      }
    }

    setFriendRequests({
      incoming: requestData.incoming || [],
      outgoing: requestData.outgoing || [],
    });
    setAllowFriendRequests(socialSettingsData.allowFriendRequests !== false);
  }

  useEffect(() => {
    if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    const bridge = getDesktopBridge();
    if (!bridge?.getSession) {
      desktopSessionLoadedRef.current = true;
      return;
    }
    bridge
      .getSession()
      .then((data) => {
        if (cancelled || !data) return;
        const nextAccess =
          typeof data.accessToken === "string" ? data.accessToken : "";
        const nextRefresh =
          typeof data.refreshToken === "string" ? data.refreshToken : "";
        if (nextAccess && !accessToken) setAccessToken(nextAccess);
        if (nextRefresh && !refreshToken) setRefreshToken(nextRefresh);
      })
      .catch(() => {})
      .finally(() => {
        desktopSessionLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      window.opencomDesktopBridge?.setPresenceAuth?.({
        accessToken: accessToken || "",
        coreApi: CORE_API,
      });
    } catch {}
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void requestSystemNotificationPermission();
  }, [accessToken]);

  useEffect(() => {
    if (accessToken || !refreshToken) return;
    refreshAccessTokenWithRefreshToken()
      .then((data) => {
        if (!data?.accessToken) return;
        setAccessToken(data.accessToken);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
      })
      .catch(() => {});
  }, [accessToken, refreshToken]);

  const selfRichPresenceSnapshot = useMemo(
    () =>
      JSON.stringify(
        (me?.id ? presenceByUserId[me.id]?.richPresence : null) || null,
      ),
    [me?.id, presenceByUserId],
  );

  useEffect(() => {
    if (!me?.id) return;
    let parsed = null;
    try {
      parsed = JSON.parse(selfRichPresenceSnapshot);
    } catch {}
    setRpcForm(rpcFormFromActivity(parsed));
  }, [me?.id, selfRichPresenceSnapshot]);

  useEffect(() => {
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, [refreshToken]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.setSession) return;
    if (!desktopSessionLoadedRef.current) return;
    bridge
      .setSession({
        accessToken: accessToken || "",
        refreshToken: refreshToken || "",
      })
      .catch(() => {});
  }, [accessToken, refreshToken]);

  useEffect(() => {
    const onAccessRefresh = (event) => {
      const nextAccess = event?.detail?.accessToken || "";
      const nextRefresh = event?.detail?.refreshToken || "";
      if (nextAccess) setAccessToken(nextAccess);
      if (nextRefresh) setRefreshToken(nextRefresh);
    };
    const onMembershipRefresh = (event) => {
      const serverId = event?.detail?.serverId;
      const membershipToken = event?.detail?.membershipToken;
      if (!serverId || !membershipToken) return;
      setServers((current) =>
        current.map((server) =>
          server.id === serverId ? { ...server, membershipToken } : server,
        ),
      );
    };
    window.addEventListener("opencom-access-token-refresh", onAccessRefresh);
    window.addEventListener(
      "opencom-membership-token-refresh",
      onMembershipRefresh,
    );
    return () => {
      window.removeEventListener(
        "opencom-access-token-refresh",
        onAccessRefresh,
      );
      window.removeEventListener(
        "opencom-membership-token-refresh",
        onMembershipRefresh,
      );
    };
  }, []);

  useEffect(() => {
    if (accessToken) return;
    const storedFriends = getStoredJson(`opencom_friends_${storageScope}`, []);
    const storedDms = getStoredJson(`opencom_dms_${storageScope}`, []);
    setFriends(storedFriends);
    setDms(storedDms);
    if (!storedDms.some((item) => item.id === activeDmId))
      setActiveDmId(storedDms[0]?.id || "");
  }, [storageScope, accessToken]);

  useEffect(() => {
    localStorage.setItem(
      `opencom_friends_${storageScope}`,
      JSON.stringify(friends),
    );
  }, [friends, storageScope]);

  useEffect(() => {
    localStorage.setItem(`opencom_dms_${storageScope}`, JSON.stringify(dms));
  }, [dms, storageScope]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 4500);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    localStorage.setItem(SELF_STATUS_KEY, selfStatus);
  }, [selfStatus]);

  useEffect(() => {
    localStorage.setItem(PINNED_DM_KEY, JSON.stringify(pinnedDmMessages));
  }, [pinnedDmMessages]);

  useEffect(() => {
    localStorage.setItem(
      VOICE_MEMBER_AUDIO_PREFS_KEY,
      JSON.stringify(voiceMemberAudioPrefsByGuild || {}),
    );
  }, [voiceMemberAudioPrefsByGuild]);

  useEffect(() => {
    if (activeDmId) localStorage.setItem(ACTIVE_DM_KEY, activeDmId);
    setDmReplyTarget(null);
  }, [activeDmId]);

  useEffect(() => {
    const onResize = () =>
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!draggingProfileCard) return;
    const onMove = (event) => {
      if (
        profileCardDragPointerIdRef.current != null &&
        Number.isFinite(Number(event.pointerId)) &&
        event.pointerId !== profileCardDragPointerIdRef.current
      )
        return;
      const rawX = invertProfileDrag
        ? profileCardDragOffsetRef.current.x - event.clientX
        : event.clientX - profileCardDragOffsetRef.current.x;
      const rawY = invertProfileDrag
        ? profileCardDragOffsetRef.current.y - event.clientY
        : event.clientY - profileCardDragOffsetRef.current.y;
      setProfileCardPosition(
        clampProfileCardPosition(rawX, rawY, getProfileCardClampOptions()),
      );
    };
    const onUp = (event) => {
      if (
        profileCardDragPointerIdRef.current != null &&
        Number.isFinite(Number(event.pointerId)) &&
        event.pointerId !== profileCardDragPointerIdRef.current
      )
        return;
      profileCardDragPointerIdRef.current = null;
      setDraggingProfileCard(false);
    };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingProfileCard, invertProfileDrag]);

  useEffect(() => {
    if (!memberProfileCard) return;
    const raf = window.requestAnimationFrame(() => {
      setProfileCardPosition((current) => {
        const next = clampProfileCardPosition(
          current.x,
          current.y,
          getProfileCardClampOptions(),
        );
        return next.x === current.x && next.y === current.y ? current : next;
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [memberProfileCard?.id, viewportSize.width, viewportSize.height]);

  useEffect(() => {
    fullProfileElementsRef.current = fullProfileDraft?.elements || [];
  }, [fullProfileDraft?.elements]);

  useEffect(() => {
    if (!fullProfileDraggingElementId) return;
    const onMove = (event) => {
      const canvas = fullProfileEditorCanvasRef.current;
      if (!canvas) return;
      const activeElement = (fullProfileElementsRef.current || []).find(
        (item) => item.id === fullProfileDraggingElementId,
      );
      if (!activeElement) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = ((event.clientX - rect.left) / rect.width) * 100;
      const py = ((event.clientY - rect.top) / rect.height) * 100;
      const nextRect = clampProfileElementRect(
        {
          x: px - fullProfileDragOffsetRef.current.x,
          y: py - fullProfileDragOffsetRef.current.y,
          w: activeElement.w,
          h: activeElement.h,
        },
        activeElement,
      );
      updateFullProfileElement(fullProfileDraggingElementId, {
        x: nextRect.x,
        y: nextRect.y,
      });
    };
    const onUp = () => setFullProfileDraggingElementId("");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [fullProfileDraggingElementId]);

  useEffect(() => {
    const elements = fullProfileDraft?.elements || [];
    if (!elements.length) {
      if (profileStudioSelectedElementId) setProfileStudioSelectedElementId("");
      return;
    }
    if (
      !profileStudioSelectedElementId ||
      !elements.some((item) => item.id === profileStudioSelectedElementId)
    ) {
      setProfileStudioSelectedElementId(elements[0].id);
    }
  }, [fullProfileDraft?.elements, profileStudioSelectedElementId]);

  useEffect(() => {
    const onGlobalClick = () => {
      setServerContextMenu(null);
      setMessageContextMenu(null);
      setMemberContextMenu(null);
      setChannelContextMenu(null);
      setCategoryContextMenu(null);
      setMessageReactionPicker(null);
      if (!settingsOpen) setMemberProfileCard(null);
    };
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setServerContextMenu(null);
        setMessageContextMenu(null);
        setMemberContextMenu(null);
        setChannelContextMenu(null);
        setCategoryContextMenu(null);
        setMemberProfileCard(null);
        setMessageReactionPicker(null);
        setSettingsOpen(false);
      }
    };

    window.addEventListener("click", onGlobalClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("click", onGlobalClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, [settingsOpen]);

  useEffect(() => {
    setMessageReactionPicker(null);
    setMessageReactionPickerQuery("");
  }, [navMode, activeGuildId, activeChannelId, activeDmId]);

  useEffect(() => {
    if (messageReactionPicker && !activeMessageReactionTarget) {
      setMessageReactionPicker(null);
      setMessageReactionPickerQuery("");
      return;
    }
    if (!messageReactionPicker && messageReactionPickerQuery) {
      setMessageReactionPickerQuery("");
    }
  }, [
    activeMessageReactionTarget,
    messageReactionPicker,
    messageReactionPickerQuery,
  ]);

  useEffect(() => {
    const secret = "invert";
    const onSecretKey = (event) => {
      if (!event?.key || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = String(event.key).toLowerCase();
      if (!/^[a-z]$/.test(key)) {
        dragEasterEggBufferRef.current = "";
        return;
      }
      const next = (dragEasterEggBufferRef.current + key).slice(-secret.length);
      dragEasterEggBufferRef.current = next;
      if (next === secret) {
        setInvertProfileDrag((current) => {
          const updated = !current;
          setStatus(
            updated
              ? "Easter egg enabled: profile drag is inverted."
              : "Easter egg disabled: profile drag restored.",
          );
          return updated;
        });
        dragEasterEggBufferRef.current = "";
      }
    };

    window.addEventListener("keydown", onSecretKey);
    return () => window.removeEventListener("keydown", onSecretKey);
  }, []);

  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!target) return false;
      const tag = String(target.tagName || "").toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        !!target.isContentEditable
      );
    };

    const onHotkey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const key = String(event.key || "").toLowerCase();

      if (key === "m") {
        event.preventDefault();
        setIsMuted((value) => !value);
      } else if (key === "d") {
        event.preventDefault();
        setIsDeafened((value) => !value);
      } else if (key === "v") {
        event.preventDefault();
        if (isInVoiceChannel) toggleScreenShare().catch(() => {});
      } else if (key === "x") {
        event.preventDefault();
        if (isInVoiceChannel) leaveVoiceChannel().catch(() => {});
      } else if (key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };

    window.addEventListener("keydown", onHotkey);
    return () => window.removeEventListener("keydown", onHotkey);
  }, [isInVoiceChannel]);

  useEffect(() => {
    if (navMode !== "servers") previousServerChannelIdRef.current = "";
    if (navMode !== "dms") previousDmIdRef.current = "";
  }, [navMode]);

  async function loadOlderServerMessages() {
    if (navMode !== "servers" || !activeServer || !activeChannelId)
      return false;
    const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
    if (!channelKey) return false;
    if (serverHistoryLoadingByChannelRef.current[channelKey]) return false;
    if (serverHistoryHasMoreByChannelRef.current[channelKey] === false)
      return false;

    const currentMessages = activeServerMessagesRef.current || [];
    const oldestMessage = currentMessages[0];
    const before = toIsoTimestamp(
      oldestMessage?.created_at || oldestMessage?.createdAt,
    );
    if (!before) {
      serverHistoryHasMoreByChannelRef.current[channelKey] = false;
      return false;
    }

    const container = messagesRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;
    const targetChannelId = activeChannelId;
    const targetGuildId = activeGuildId;
    const targetServerId = activeServer.id;
    serverHistoryLoadingByChannelRef.current[channelKey] = true;

    try {
      const path = buildPaginatedPath(
        `/v1/channels/${targetChannelId}/messages`,
        {
          limit: MESSAGE_PAGE_SIZE,
          before,
        },
      );
      const data = await nodeApi(
        activeServer.baseUrl,
        path,
        activeServer.membershipToken,
      );
      if (
        activeChannelIdRef.current !== targetChannelId ||
        activeGuildIdRef.current !== targetGuildId ||
        activeServerIdRef.current !== targetServerId
      ) {
        return false;
      }

      const fetched = Array.isArray(data?.messages) ? data.messages : [];
      const olderMessages = fetched.slice().reverse();
      const hasMore =
        data?.hasMore != null
          ? !!data.hasMore
          : fetched.length >= MESSAGE_PAGE_SIZE;
      serverHistoryHasMoreByChannelRef.current[channelKey] = hasMore;
      if (!olderMessages.length) return false;

      setMessages((current) =>
        mergeMessagesChronologically(
          current,
          olderMessages,
          (message) => message.created_at || message.createdAt,
        ),
      );

      window.requestAnimationFrame(() => {
        const nextContainer = messagesRef.current;
        if (!nextContainer) return;
        const delta = nextContainer.scrollHeight - previousScrollHeight;
        nextContainer.scrollTop = Math.max(0, previousScrollTop + delta);
      });

      return true;
    } catch (error) {
      setStatus(`Message history fetch failed: ${error.message}`);
      return false;
    } finally {
      serverHistoryLoadingByChannelRef.current[channelKey] = false;
    }
  }

  async function loadOlderDmMessages() {
    if (navMode !== "dms" || !activeDmId || !accessToken) return false;
    const threadId = activeDmId;
    if (dmHistoryLoadingByThreadRef.current[threadId]) return false;
    if (dmHistoryHasMoreByThreadRef.current[threadId] === false) return false;

    const currentMessages = activeDmMessagesRef.current || [];
    const oldestMessage = currentMessages[0];
    const before = toIsoTimestamp(
      oldestMessage?.createdAt || oldestMessage?.created_at,
    );
    if (!before) {
      dmHistoryHasMoreByThreadRef.current[threadId] = false;
      return false;
    }

    const container = dmMessagesRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;
    const previousScrollTop = container?.scrollTop || 0;
    dmHistoryLoadingByThreadRef.current[threadId] = true;

    try {
      const path = buildPaginatedPath(`/v1/social/dms/${threadId}/messages`, {
        limit: MESSAGE_PAGE_SIZE,
        before,
      });
      const data = await api(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (activeDmIdRef.current !== threadId) return false;

      const olderMessages = Array.isArray(data?.messages) ? data.messages : [];
      const hasMore =
        data?.hasMore != null
          ? !!data.hasMore
          : olderMessages.length >= MESSAGE_PAGE_SIZE;
      dmHistoryHasMoreByThreadRef.current[threadId] = hasMore;
      if (!olderMessages.length) return false;

      setDms((current) =>
        current.map((item) => {
          if (item.id !== threadId) return item;
          return {
            ...item,
            messages: mergeMessagesChronologically(
              item.messages || [],
              olderMessages,
              (message) => message.createdAt || message.created_at,
            ),
          };
        }),
      );

      window.requestAnimationFrame(() => {
        const nextContainer = dmMessagesRef.current;
        if (!nextContainer) return;
        const delta = nextContainer.scrollHeight - previousScrollHeight;
        nextContainer.scrollTop = Math.max(0, previousScrollTop + delta);
      });

      return true;
    } catch (error) {
      setStatus(`DM history fetch failed: ${error.message}`);
      return false;
    } finally {
      dmHistoryLoadingByThreadRef.current[threadId] = false;
    }
  }

  // Keep server chat scroll position per channel and only auto-scroll when user is near the bottom.
  useEffect(() => {
    if (!messagesRef.current || navMode !== "servers") return;
    const container = messagesRef.current;
    const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
    const isNewChannel = channelKey !== previousServerChannelIdRef.current;
    const currentMessageCount = messages.length;

    if (isNewChannel) {
      previousServerChannelIdRef.current = channelKey;
      lastServerMessageCountRef.current = currentMessageCount;
      const savedTop = serverScrollPositionsRef.current[channelKey];
      if (Number.isFinite(savedTop)) {
        container.scrollTop = savedTop;
        isServerAtBottomRef.current =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          100;
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
        isServerAtBottomRef.current = true;
      }
      return;
    }

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;
    const hasNewMessages =
      currentMessageCount > lastServerMessageCountRef.current;
    if (hasNewMessages && isNearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      isServerAtBottomRef.current = true;
    } else if (hasNewMessages) {
      isServerAtBottomRef.current = false;
    }
    lastServerMessageCountRef.current = currentMessageCount;
  }, [messages, activeGuildId, activeChannelId, navMode]);

  // Persist server channel scroll location.
  useEffect(() => {
    if (!messagesRef.current || navMode !== "servers") return;
    const container = messagesRef.current;
    const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
    const handleScroll = () => {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;
      isServerAtBottomRef.current = isNearBottom;
      serverScrollPositionsRef.current[channelKey] = container.scrollTop;
      if (container.scrollTop <= MESSAGE_HISTORY_PREFETCH_THRESHOLD_PX) {
        void loadOlderServerMessages();
      }
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [navMode, activeGuildId, activeChannelId, activeServer]);

  // Keep DM scroll position per thread and only auto-scroll when user is near the bottom.
  useEffect(() => {
    if (!dmMessagesRef.current || navMode !== "dms") return;
    const container = dmMessagesRef.current;
    const dmKey = activeDmId || "";
    const isNewDm = dmKey !== previousDmIdRef.current;
    const currentMessageCount = activeDm?.messages?.length || 0;

    if (isNewDm) {
      previousDmIdRef.current = dmKey;
      lastDmMessageCountRef.current = currentMessageCount;
      const savedTop = dmScrollPositionsRef.current[dmKey];
      if (Number.isFinite(savedTop)) {
        container.scrollTop = savedTop;
        isAtBottomRef.current =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          100;
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
        isAtBottomRef.current = true;
      }
      return;
    }

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;
    const hasNewMessages = currentMessageCount > lastDmMessageCountRef.current;
    if (hasNewMessages && isNearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      isAtBottomRef.current = true;
    } else if (hasNewMessages) {
      isAtBottomRef.current = false;
    }
    lastDmMessageCountRef.current = currentMessageCount;
  }, [activeDm?.messages, activeDmId, navMode]);

  // Persist DM scroll location.
  useEffect(() => {
    if (!dmMessagesRef.current || navMode !== "dms") return;
    const container = dmMessagesRef.current;
    const dmKey = activeDmId || "";
    const handleScroll = () => {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;
      isAtBottomRef.current = isNearBottom;
      dmScrollPositionsRef.current[dmKey] = container.scrollTop;
      if (container.scrollTop <= MESSAGE_HISTORY_PREFETCH_THRESHOLD_PX) {
        void loadOlderDmMessages();
      }
    };
    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [navMode, activeDmId, accessToken]);

  useEffect(() => {
    if (!remoteScreenShares.length) {
      setSelectedScreenShareProducerId("");
      return;
    }
    const selectedStillExists = remoteScreenShares.some(
      (share) => share.producerId === selectedScreenShareProducerId,
    );
    if (!selectedStillExists) {
      setSelectedScreenShareProducerId(remoteScreenShares[0].producerId);
    }
  }, [remoteScreenShares, selectedScreenShareProducerId]);

  useEffect(() => {
    setFullProfileViewerMusicPlaying(false);
    const audio = fullProfileViewerMusicAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [fullProfileViewer?.id]);

  useEffect(() => {
    const audio = fullProfileViewerMusicAudioRef.current;
    if (!audio || !fullProfileViewer) return;
    try {
      audio.volume = Math.max(
        0,
        Math.min(
          1,
          Number(fullProfileViewer.fullProfile?.music?.volume ?? 60) / 100,
        ),
      );
      audio.loop = fullProfileViewer.fullProfile?.music?.loop !== false;
    } catch {
      // ignore
    }
  }, [fullProfileViewer]);

  useEffect(() => {
    if (
      !fullProfileViewerHasPlayableMusic ||
      !fullProfileViewer?.fullProfile?.music?.autoplay
    )
      return;
    const audio = fullProfileViewerMusicAudioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => {
        setFullProfileViewerMusicPlaying(true);
      })
      .catch(() => {
        setFullProfileViewerMusicPlaying(false);
      });
  }, [
    fullProfileViewerHasPlayableMusic,
    fullProfileViewer?.fullProfile?.music?.autoplay,
    fullProfileViewer?.fullProfile?.music?.url,
  ]);

  useEffect(() => {
    if (!accessToken) return;

    async function loadSession() {
      try {
        const meData = await api("/v1/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setMe(meData);

        const [profileData, serverData, emoteCatalogData] = await Promise.all([
          api("/v1/me/profile", {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          api("/v1/servers", {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          api("/v1/emotes/catalog", {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        const nextServers = normalizeServerList(serverData.servers || []);
        setProfile(profileData);
        setFullProfileDraft(
          normalizeFullProfile(profileData, profileData.fullProfile),
        );
        setProfileForm({
          username: profileData.username || meData.username || "",
          displayName: profileData.displayName || "",
          bio: profileData.bio || "",
          pfpUrl: profileData.pfpUrl || "",
          bannerUrl: profileData.bannerUrl || "",
          notificationSoundUrl: profileData.notificationSoundUrl || "",
        });

        setGlobalCustomEmoteCatalog(
          Array.isArray(emoteCatalogData?.emotes) ? emoteCatalogData.emotes : [],
        );
        setServers(nextServers);
        try {
          await refreshSocialData(accessToken);
        } catch {
          // fallback to local-only social data if backend social routes are unavailable
        }

        if (!nextServers.length) {
          setActiveServerId("");
          setActiveGuildId("");
          setGuildState(null);
          setMessages([]);
          return;
        }

        if (!nextServers.some((server) => server.id === activeServerId)) {
          setActiveServerId(nextServers[0].id);
        }
      } catch (error) {
        const msg = String(error?.message || "");
        if (
          msg.includes("UNAUTHORIZED") ||
          msg.includes("HTTP_401") ||
          msg.includes("INVALID_REFRESH") ||
          msg.includes("REFRESH_")
        ) {
          setAccessToken("");
          setRefreshToken("");
          setServers([]);
          setGlobalCustomEmoteCatalog([]);
          setGuildState(null);
          setMessages([]);
          setStatus("Session expired. Please sign in again.");
          return;
        }
        setStatus(`Session error: ${error.message}`);
      }
    }

    loadSession();
  }, [accessToken]);

  // Core gateway: connect for presence updates, send SET_PRESENCE when self status changes
  useEffect(() => {
    if (!accessToken || !me?.id) {
      setGatewayConnected(false);
      if (gatewayWsRef.current) {
        gatewayWsRef.current.close();
        gatewayWsRef.current = null;
      }
      if (gatewayHeartbeatRef.current) {
        clearInterval(gatewayHeartbeatRef.current);
        gatewayHeartbeatRef.current = null;
      }
      return;
    }
    let deviceId = localStorage.getItem(GATEWAY_DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId =
        "web-" + Math.random().toString(36).slice(2) + "-" + Date.now();
      localStorage.setItem(GATEWAY_DEVICE_ID_KEY, deviceId);
    }
    let disposed = false;
    let connected = false;
    let hasEverConnected = false;
    let reconnectTimer = null;
    let candidateIndex = 0;
    let reconnectAttempts = 0;
    const candidates = prioritizeLastSuccessfulGateway(
      getCoreGatewayWsCandidates(),
      LAST_CORE_GATEWAY_KEY,
    );

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(5000, 300 * 2 ** Math.min(reconnectAttempts, 4));
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(connectNext, delay);
    };

    const connectNext = () => {
      if (disposed || connected || !candidates.length) return;

      const wsUrl = candidates[candidateIndex % candidates.length];
      candidateIndex += 1;
      const ws = new WebSocket(wsUrl);
      gatewayWsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({ op: "IDENTIFY", d: { accessToken, deviceId } }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.op === "HELLO" && msg.d?.heartbeat_interval) {
            if (gatewayHeartbeatRef.current)
              clearInterval(gatewayHeartbeatRef.current);
            gatewayHeartbeatRef.current = setInterval(() => {
              if (gatewayWsRef.current?.readyState === WebSocket.OPEN)
                gatewayWsRef.current.send(JSON.stringify({ op: "HEARTBEAT" }));
            }, msg.d.heartbeat_interval);
          }
          if (msg.op === "READY") {
            connected = true;
            hasEverConnected = true;
            reconnectAttempts = 0;
            setGatewayConnected(true);
            localStorage.setItem(LAST_CORE_GATEWAY_KEY, wsUrl);
            setStatus("");
            if (gatewayWsRef.current?.readyState === WebSocket.OPEN) {
              gatewayWsRef.current.send(
                JSON.stringify({
                  op: "DISPATCH",
                  t: "SET_PRESENCE",
                  d: { status: selfStatus, customStatus: null },
                }),
              );
            }
          }
          if (msg.op === "DISPATCH" && msg.t === "PRESENCE_SYNC_REQUEST") {
            if (gatewayWsRef.current?.readyState === WebSocket.OPEN) {
              gatewayWsRef.current.send(
                JSON.stringify({
                  op: "DISPATCH",
                  t: "SET_PRESENCE",
                  d: { status: selfStatusRef.current, customStatus: null },
                }),
              );
            }
          }
          if (
            msg.op === "DISPATCH" &&
            msg.t === "PRESENCE_UPDATE" &&
            msg.d?.userId
          ) {
            setPresenceByUserId((prev) => ({
              ...prev,
              [msg.d.userId]: {
                status: msg.d.status ?? "offline",
                customStatus: msg.d.customStatus ?? null,
                richPresence: msg.d.richPresence ?? null,
              },
            }));
          }
          if (
            msg.op === "DISPATCH" &&
            msg.t === "SOCIAL_DM_MESSAGE_CREATE" &&
            msg.d?.threadId &&
            msg.d?.message?.id
          ) {
            const threadId = msg.d.threadId;
            const incoming = msg.d.message;
            setDms((current) => {
              const next = [...current];
              const idx = next.findIndex((item) => item.id === threadId);
              const already = (messages = []) =>
                messages.some((m) => m.id === incoming.id);
              if (idx >= 0) {
                const existing = next[idx];
                if (already(existing.messages || [])) return current;
                next[idx] = {
                  ...existing,
                  badgeDetails:
                    existing.badgeDetails && existing.badgeDetails.length > 0
                      ? existing.badgeDetails
                      : incoming.badgeDetails || [],
                  isOfficial:
                    existing.isOfficial === true || incoming.isOfficial === true,
                  isNoReply:
                    existing.isNoReply === true || incoming.isNoReply === true,
                  messages: [
                    ...(existing.messages || []),
                    {
                      ...incoming,
                      reactions: incoming.reactions || [],
                    },
                  ],
                };
                return next;
              }
              return [
                {
                  id: threadId,
                  participantId:
                    incoming.authorId === me?.id
                      ? "unknown"
                      : incoming.authorId,
                  name:
                    incoming.authorId === me?.id
                      ? "Unknown"
                      : incoming.author || "Unknown",
                  badgeDetails: incoming.badgeDetails || [],
                  isOfficial: incoming.isOfficial === true,
                  isNoReply: incoming.isNoReply === true,
                  messages: [
                    {
                      ...incoming,
                      reactions: incoming.reactions || [],
                    },
                  ],
                },
                ...next,
              ];
            });
            if (incoming.authorId && incoming.authorId !== me?.id) {
              const isCallRequestMessage =
                String(incoming.content || "").trim() === "__CALL_REQUEST__";
              if (!isCallRequestMessage) {
                playNotificationBeep({
                  mute: selfStatusRef.current === "dnd",
                  soundUrl: notificationSoundUrlRef.current,
                });
                setDmNotification({ dmId: threadId, at: Date.now() });
                notifyDesktopDevice({
                  title: incoming.author || "New message",
                  body:
                    truncateUiText(incoming.content || "", 140) ||
                    "Open OpenCom to read the message.",
                  tag: `dm:${threadId}`,
                  onClick: () => {
                    setNavMode("dms");
                    setActiveDmId(threadId);
                  },
                });
              }
            }
          }
          if (
            msg.op === "DISPATCH" &&
            msg.t === "SOCIAL_DM_MESSAGE_DELETE" &&
            msg.d?.threadId &&
            msg.d?.messageId
          ) {
            const threadId = msg.d.threadId;
            const messageId = msg.d.messageId;
            setDms((current) =>
              current.map((item) =>
                item.id === threadId
                  ? {
                      ...item,
                      messages: (item.messages || []).filter(
                        (m) => m.id !== messageId,
                      ),
                    }
                  : item,
              ),
            );
          }
          if (
            msg.op === "DISPATCH" &&
            msg.t === "SOCIAL_DM_MESSAGE_REACTION_UPDATE" &&
            msg.d?.threadId &&
            msg.d?.messageId
          ) {
            applyDmMessageReactions(
              msg.d.threadId,
              msg.d.messageId,
              Array.isArray(msg.d.reactions) ? msg.d.reactions : [],
            );
          }

          // ── Private call events ─────────────────────────────────────────
          if (
            msg.op === "DISPATCH" &&
            msg.t === "PRIVATE_CALL_CREATE" &&
            msg.d?.callId
          ) {
            const d = msg.d;
            if (d.callerId !== me?.id) {
              // We are the recipient — look up caller name from friends / DMs
              setFriends((currentFriends) => {
                const caller = currentFriends.find((f) => f.id === d.callerId);
                setDms((currentDms) => {
                  const dmThread = currentDms.find(
                    (dm) => dm.participantId === d.callerId,
                  );
                  const callerName =
                    caller?.username || dmThread?.name || "Unknown";
                  const callerPfp = caller?.pfp_url || null;
                  setIncomingCall({
                    callId: d.callId,
                    callerId: d.callerId,
                    callerName,
                    callerPfp,
                    channelId: d.channelId,
                    guildId: d.guildId,
                    nodeBaseUrl: d.nodeBaseUrl,
                  });
                  notifyDesktopDevice({
                    title: "Incoming call",
                    body: `${callerName} is calling you`,
                    tag: `call:${d.callId}`,
                    onClick: () => {
                      setNavMode("dms");
                      if (dmThread?.id) setActiveDmId(dmThread.id);
                    },
                  });
                  return currentDms; // no mutation
                });
                return currentFriends; // no mutation
              });
              playNotificationBeep({
                mute: selfStatusRef.current === "dnd",
                soundUrl: notificationSoundUrlRef.current,
              });
            } else {
              // We are the caller — transition outgoing toast to "ringing" state
              setOutgoingCall((prev) =>
                prev ? { ...prev, callId: d.callId } : prev,
              );
            }
          }

          if (
            msg.op === "DISPATCH" &&
            msg.t === "FRIEND_REQUEST" &&
            msg.d?.requestId
          ) {
            const requestId = String(msg.d.requestId || "");
            const userId = String(msg.d.userId || "");
            const username = String(msg.d.username || "Someone");
            setFriendRequests((prev) => ({
              incoming: [
                {
                  id: requestId,
                  userId,
                  username,
                  createdAt: new Date().toISOString(),
                },
                ...prev.incoming.filter((item) => item.id !== requestId),
              ],
              outgoing: prev.outgoing,
            }));
            notifyDesktopDevice({
              title: "Friend request",
              body: `${username} sent you a friend request`,
              tag: `friend-request:${requestId}`,
              onClick: () => {
                setNavMode("friends");
                setFriendView("requests");
              },
            });
          }

          if (
            msg.op === "DISPATCH" &&
            msg.t === "FRIEND_ACCEPTED" &&
            msg.d?.friendId
          ) {
            const friendId = String(msg.d.friendId || "");
            const username = String(msg.d.username || "New friend");
            const threadId = String(msg.d.threadId || "");
            setFriendRequests((prev) => ({
              incoming: prev.incoming,
              outgoing: prev.outgoing.filter((item) => item.userId !== friendId),
            }));
            setFriends((current) => {
              const existing = current.find((item) => item.id === friendId);
              if (existing) return current;
              return [
                {
                  id: friendId,
                  username,
                  pfp_url: null,
                  status: "online",
                },
                ...current,
              ];
            });
            if (threadId) {
              setDms((current) => {
                const existingIndex = current.findIndex(
                  (item) => item.id === threadId || item.participantId === friendId,
                );
                const nextDm = {
                  id: threadId,
                  participantId: friendId,
                  name: username,
                  pfp_url: null,
                  lastMessageAt: null,
                  lastMessageContent: null,
                  messages: [],
                };
                if (existingIndex < 0) return [nextDm, ...current];
                const existing = current[existingIndex];
                const next = [...current];
                next[existingIndex] = {
                  ...existing,
                  id: existing.id || threadId,
                  participantId: existing.participantId || friendId,
                  name: existing.name || username,
                };
                return next;
              });
            }
            notifyDesktopDevice({
              title: "Friend request accepted",
              body: `${username} accepted your friend request`,
              tag: `friend-accepted:${friendId}`,
              onClick: () => {
                setNavMode("friends");
                if (threadId) {
                  setNavMode("dms");
                  setActiveDmId(threadId);
                }
              },
            });
          }

          if (
            msg.op === "DISPATCH" &&
            msg.t === "PRIVATE_CALL_ENDED" &&
            msg.d?.callId
          ) {
            const endedId = msg.d.callId;
            void clearPrivateCallLocally(
              endedId,
              "Private call ended.",
            );
          }
          // ── End private call events ─────────────────────────────────────
        } catch (_) {}
      };

      ws.onclose = () => {
        if (disposed) return;
        setGatewayConnected(false);
        gatewayWsRef.current = null;
        if (gatewayHeartbeatRef.current) {
          clearInterval(gatewayHeartbeatRef.current);
          gatewayHeartbeatRef.current = null;
        }

        connected = false;
        rejectPendingVoiceEvents("VOICE_GATEWAY_CLOSED");
        scheduleReconnect();

        if (!hasEverConnected) {
          setStatus(
            "Gateway websocket unavailable. Check DNS/TLS or set VITE_CORE_GATEWAY_URL.",
          );
        } else {
          setStatus("Gateway disconnected. Reconnecting...");
        }
      };

      ws.onerror = () => {};
    };

    connectNext();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setGatewayConnected(false);
      if (gatewayHeartbeatRef.current)
        clearInterval(gatewayHeartbeatRef.current);
      gatewayHeartbeatRef.current = null;
      if (gatewayWsRef.current) gatewayWsRef.current.close();
      gatewayWsRef.current = null;
    };
  }, [accessToken, me?.id]);

  useEffect(() => {
    if (
      !accessToken ||
      !me?.id ||
      gatewayWsRef.current?.readyState !== WebSocket.OPEN
    )
      return;
    gatewayWsRef.current.send(
      JSON.stringify({
        op: "DISPATCH",
        t: "SET_PRESENCE",
        d: { status: selfStatus, customStatus: null },
      }),
    );
  }, [selfStatus, accessToken, me?.id]);

  useEffect(() => {
    const server = nodeGatewayTargetServer;

    // Keep node gateway alive for the active server. If we're currently connected
    // to voice in another server, pin the gateway to that voice server so VC stays alive.
    if (!server?.baseUrl || !server?.membershipToken) {
      voiceGatewayCandidatesRef.current = [];
      nodeGatewayReadyRef.current = false;
      setNodeGatewayConnected(false);
      setNodeGatewayServerId("");

      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }

      if (nodeGatewayWsRef.current) {
        try {
          nodeGatewayWsRef.current.close();
        } catch {}
        nodeGatewayWsRef.current = null;
      }

      return;
    }

    if (nodeGatewayUnavailableByServer[server.id]) {
      voiceGatewayCandidatesRef.current = [];
      nodeGatewayReadyRef.current = false;
      setNodeGatewayConnected(false);
      setNodeGatewayServerId("");

      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }

      if (nodeGatewayWsRef.current) {
        try {
          nodeGatewayWsRef.current.close();
        } catch {}
        nodeGatewayWsRef.current = null;
      }

      return;
    }

    const wsCandidates = getLastSuccessfulGateway(
      getVoiceGatewayWsCandidates(server.baseUrl),
      LAST_SERVER_GATEWAY_KEY,
    );
    voiceGatewayCandidatesRef.current = wsCandidates;
    if (!wsCandidates.length) {
      setNodeGatewayConnected(false);
      setNodeGatewayServerId("");
      return;
    }

    let disposed = false;
    let connected = false;
    let hasEverConnected = false;
    let reconnectTimer = null;
    let candidateIndex = 0;
    let reconnectAttempts = 0;
    let guildRefreshTimer = null;

    const applyGuildState = (state) => {
      if (activeServerIdRef.current !== server.id) return;
      const allChannels = state.channels || [];
      setGuildState(state);

      const activeExists = allChannels.some(
        (channel) => channel.id === activeChannelIdRef.current,
      );
      if (activeExists) return;

      const firstTextChannel =
        allChannels.find((channel) => channel.type === "text")?.id || "";
      setActiveChannelId(firstTextChannel);
    };

    const refreshActiveGuildStateFromNode = () => {
      if (activeServerIdRef.current !== server.id) return;
      const guildId = activeGuildIdRef.current;
      if (!guildId) return;
      nodeApi(
        server.baseUrl,
        `/v1/guilds/${guildId}/state`,
        server.membershipToken,
      )
        .then((state) => {
          if (disposed) return;
          applyGuildState(state);
        })
        .catch(() => {});
    };

    const scheduleGuildRefresh = (delay = 150) => {
      if (guildRefreshTimer) clearTimeout(guildRefreshTimer);
      guildRefreshTimer = setTimeout(refreshActiveGuildStateFromNode, delay);
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(5000, 300 * 2 ** Math.min(reconnectAttempts, 4));
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(connectNext, delay);
    };

    const connectNext = async () => {
      if (disposed || !wsCandidates.length) return;

      const wsUrl = wsCandidates[candidateIndex % wsCandidates.length];
      candidateIndex += 1;
      const membershipToken =
        (await ensureFreshMembershipToken(
          server.baseUrl,
          server.membershipToken,
          {
            minValidityMs: 2 * 60 * 1000,
          },
        ).catch(() => server.membershipToken)) || server.membershipToken;
      if (disposed || !membershipToken) return;

      const ws = new WebSocket(wsUrl);
      nodeGatewayWsRef.current = ws;

      ws.onopen = () => {
        setStatus("");
        ws.send(
          JSON.stringify({
            op: "IDENTIFY",
            d: { membershipToken },
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          resolvePendingVoiceEvent(msg);

          if (msg.op === "HELLO" && msg.d?.heartbeat_interval) {
            if (nodeGatewayHeartbeatRef.current)
              clearInterval(nodeGatewayHeartbeatRef.current);
            nodeGatewayHeartbeatRef.current = setInterval(() => {
              if (nodeGatewayWsRef.current?.readyState === WebSocket.OPEN) {
                nodeGatewayWsRef.current.send(
                  JSON.stringify({ op: "HEARTBEAT" }),
                );
              }
            }, msg.d.heartbeat_interval);
            return;
          }

          if (msg.op === "READY") {
            connected = true;
            hasEverConnected = true;
            reconnectAttempts = 0;
            nodeGatewayReadyRef.current = true;
            setNodeGatewayConnected(true);
            setNodeGatewayServerId(server.id || "");
            localStorage.setItem(LAST_SERVER_GATEWAY_KEY, wsUrl);

            // Subscribe to whatever context we have right now.
            if (
              activeServerIdRef.current === server.id &&
              activeGuildIdRef.current
            ) {
              ws.send(
                JSON.stringify({
                  op: "DISPATCH",
                  t: "SUBSCRIBE_GUILD",
                  d: { guildId: activeGuildIdRef.current },
                }),
              );
            }
            if (
              activeServerIdRef.current === server.id &&
              activeChannelIdRef.current
            ) {
              ws.send(
                JSON.stringify({
                  op: "DISPATCH",
                  t: "SUBSCRIBE_CHANNEL",
                  d: { channelId: activeChannelIdRef.current },
                }),
              );
            }
            return;
          }

          if (msg.op === "ERROR" && msg.d?.error) {
            if (
              typeof msg.d.error === "string" &&
              msg.d.error.startsWith("VOICE_UPSTREAM_UNAVAILABLE") &&
              server?.id
            ) {
              setNodeGatewayUnavailableByServer((prev) =>
                prev[server.id] ? prev : { ...prev, [server.id]: true },
              );
              setStatus(
                "Realtime voice gateway unavailable for this server. Falling back to REST voice controls.",
              );
              try {
                ws.close();
              } catch {}
              return;
            }
            setStatus(`Voice gateway error: ${msg.d.error}`);
            return;
          }

          // Everything else stays the same as your existing handler:
          // MESSAGE_* + VOICE_* dispatches, etc.
          if (msg.op === "DISPATCH" && typeof msg.t === "string") {
            if (msg.t === "VOICE_ERROR") {
              const error = msg.d?.error || "VOICE_ERROR";
              const details = msg.d?.details ? ` (${msg.d.details})` : "";
              const activeVoiceContext =
                voiceSfuRef.current?.getContext?.() || {};
              voiceDebug("VOICE_ERROR received", {
                error,
                details: msg.d?.details,
                code: msg.d?.code,
                context: activeVoiceContext,
              });
              rejectPendingVoiceEventsByScope({
                guildId: msg.d?.guildId ?? activeVoiceContext.guildId ?? null,
                channelId:
                  msg.d?.channelId ?? activeVoiceContext.channelId ?? null,
              });
              if (voiceSession?.channelId) {
                cleanupVoiceRtc().catch(() => {});
                return;
              }
              const message = `Voice connection failed: ${error}${details}`;
              setStatus(message);
              window.alert(message);
              return;
            }

            if (msg.t === "MESSAGE_CREATE") {
              const channelId = msg.d?.channelId || "";
              const created = msg.d?.message || null;
              const deleted = msg.d?.messageDelete || null;

              if (
                channelId &&
                deleted?.id &&
                channelId === activeChannelIdRef.current
              ) {
                setMessages((current) =>
                  current.filter((message) => message.id !== deleted.id),
                );
              }

              if (
                channelId &&
                created &&
                channelId === activeChannelIdRef.current
              ) {
                setMessages((current) => {
                  if (current.some((message) => message.id === created.id))
                    return current;
                  const normalized = {
                    id: created.id,
                    author_id: created.authorId,
                    authorId: created.authorId,
                    username: created.username || created.authorId,
                    pfp_url: created.pfp_url ?? null,
                    content: created.content || "",
                    embeds: created.embeds || [],
                    linkEmbeds: created.linkEmbeds || [],
                    attachments: created.attachments || [],
                    reactions: created.reactions || [],
                    mentionEveryone: !!created.mentionEveryone,
                    mentions: created.mentions || [],
                    created_at: created.createdAt,
                    createdAt: created.createdAt,
                  };
                  return [...current, normalized];
                });
              } else if (channelId && created && server?.id) {
                setServerPingCounts((prev) => ({
                  ...prev,
                  [server.id]: (prev[server.id] || 0) + 1,
                }));
              }
              return;
            }

            if (msg.t === "MESSAGE_REACTIONS_UPDATE") {
              const channelId = msg.d?.channelId || "";
              const messageId = msg.d?.messageId || "";
              if (
                channelId &&
                messageId &&
                channelId === activeChannelIdRef.current
              ) {
                applyServerMessageReactions(
                  messageId,
                  Array.isArray(msg.d?.reactions) ? msg.d.reactions : [],
                );
              }
              return;
            }

            if (msg.t === "MESSAGE_MENTION" && server?.id) {
              const channelId = msg.d?.channelId || "";
              if (
                !activeChannelIdRef.current ||
                channelId !== activeChannelIdRef.current
              ) {
                setServerPingCounts((prev) => ({
                  ...prev,
                  [server.id]: (prev[server.id] || 0) + 1,
                }));
                notifyDesktopDevice({
                  title: msg.d?.mentionEveryone
                    ? `${msg.d?.authorName || "Someone"} mentioned everyone`
                    : `${msg.d?.authorName || "Someone"} mentioned you`,
                  body:
                    truncateUiText(msg.d?.contentPreview || "", 140) ||
                    `#${msg.d?.channelName || "channel"} in ${server.name}`,
                  tag: `mention:${server.id}:${channelId}`,
                  onClick: () => {
                    setNavMode("servers");
                    setActiveServerId(server.id);
                    setActiveGuildId(msg.d?.guildId || "");
                    if (channelId) setActiveChannelId(channelId);
                  },
                });
              }
              return;
            }

            if (
              msg.t === "VOICE_STATE_UPDATE" &&
              msg.d?.guildId &&
              msg.d?.userId
            ) {
              const guildId = msg.d.guildId;
              const userId = msg.d.userId;
              const channelId = msg.d.channelId || null;
              setVoiceStatesByGuild((prev) => {
                const nextGuild = { ...(prev[guildId] || {}) };
                if (channelId) {
                  nextGuild[userId] = {
                    guildId,
                    channelId,
                    userId,
                    muted: !!msg.d.muted,
                    deafened: !!msg.d.deafened,
                  };
                } else {
                  delete nextGuild[userId];
                }
                return { ...prev, [guildId]: nextGuild };
              });
            } else if (
              msg.t === "VOICE_STATE_REMOVE" &&
              msg.d?.guildId &&
              msg.d?.userId
            ) {
              const guildId = msg.d.guildId;
              const userId = msg.d.userId;
              setVoiceStatesByGuild((prev) => {
                if (!prev[guildId]?.[userId]) return prev;
                const nextGuild = { ...(prev[guildId] || {}) };
                delete nextGuild[userId];
                return { ...prev, [guildId]: nextGuild };
              });
            } else if (
              msg.t === "VOICE_SPEAKING" &&
              msg.d?.guildId &&
              msg.d?.userId
            ) {
              const guildId = msg.d.guildId;
              const userId = msg.d.userId;
              const speaking = !!msg.d.speaking;
              setVoiceSpeakingByGuild((prev) => ({
                ...prev,
                [guildId]: { ...(prev[guildId] || {}), [userId]: speaking },
              }));
            }

            if (
              activeServerIdRef.current === server.id &&
              (msg.t === "CHANNEL_CREATE" ||
                msg.t === "CHANNEL_UPDATE" ||
                msg.t === "CHANNEL_DELETE" ||
                msg.t === "CHANNEL_REORDER" ||
                msg.t === "ROLE_CREATE" ||
                msg.t === "ROLE_UPDATE" ||
                msg.t === "ROLE_DELETE" ||
                msg.t === "CHANNEL_OVERWRITE_UPDATE" ||
                msg.t === "CHANNEL_OVERWRITE_DELETE" ||
                msg.t === "CHANNEL_SYNC_PERMISSIONS" ||
                msg.t === "GUILD_MEMBER_UPDATE" ||
                msg.t === "GUILD_MEMBER_KICK" ||
                msg.t === "GUILD_MEMBER_BAN")
            ) {
              scheduleGuildRefresh();
            }

            voiceSfuRef.current
              ?.handleGatewayDispatch(msg.t, msg.d)
              .catch(() => {});
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (disposed) return;

        nodeGatewayReadyRef.current = false;

        if (nodeGatewayHeartbeatRef.current) {
          clearInterval(nodeGatewayHeartbeatRef.current);
          nodeGatewayHeartbeatRef.current = null;
        }

        nodeGatewayWsRef.current = null;
        setNodeGatewayConnected(false);
        setNodeGatewayServerId("");

        connected = false;
        rejectPendingVoiceEvents("VOICE_GATEWAY_CLOSED");
        scheduleReconnect();

        if (!hasEverConnected) {
          setStatus(
            "Voice gateway unavailable. Check core gateway/proxy configuration.",
          );
        } else {
          setStatus("Server voice gateway disconnected. Reconnecting...");
        }
      };

      ws.onerror = () => {};
    };

    void connectNext();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (guildRefreshTimer) clearTimeout(guildRefreshTimer);

      nodeGatewayReadyRef.current = false;
      setNodeGatewayConnected(false);
      setNodeGatewayServerId("");

      if (nodeGatewayHeartbeatRef.current) {
        clearInterval(nodeGatewayHeartbeatRef.current);
        nodeGatewayHeartbeatRef.current = null;
      }

      if (nodeGatewayWsRef.current) {
        try {
          nodeGatewayWsRef.current.close();
        } catch {}
        nodeGatewayWsRef.current = null;
      }
    };
  }, [
    nodeGatewayTargetServer?.id,
    nodeGatewayTargetServer?.baseUrl,
    nodeGatewayTargetServer?.membershipToken,
    nodeGatewayUnavailableByServer,
  ]);

  useEffect(() => {
    if (!activeGuildId || !activeChannelId) return;
    if (!nodeGatewayConnectedForActiveServer) return;
    const ws = nodeGatewayWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !nodeGatewayReadyRef.current)
      return;
    ws.send(
      JSON.stringify({
        op: "DISPATCH",
        t: "SUBSCRIBE_GUILD",
        d: { guildId: activeGuildId },
      }),
    );
    ws.send(
      JSON.stringify({
        op: "DISPATCH",
        t: "SUBSCRIBE_CHANNEL",
        d: { channelId: activeChannelId },
      }),
    );
  }, [activeGuildId, activeChannelId, nodeGatewayConnectedForActiveServer]);

  useEffect(() => {
    if (
      navMode !== "servers" ||
      !activeGuildId ||
      !guildState?.channels?.length
    )
      return;
    if (!nodeGatewayConnectedForActiveServer) return;
    const ws = nodeGatewayWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !nodeGatewayReadyRef.current)
      return;
    for (const channel of guildState.channels) {
      if (!channel?.id || channel.type !== "text") continue;
      ws.send(
        JSON.stringify({
          op: "DISPATCH",
          t: "SUBSCRIBE_CHANNEL",
          d: { channelId: channel.id },
        }),
      );
    }
  }, [
    navMode,
    activeGuildId,
    guildState?.channels,
    nodeGatewayConnectedForActiveServer,
  ]);

  useEffect(() => {
    if (!activeServerId) return;
    setServerPingCounts((prev) => {
      if (!prev[activeServerId]) return prev;
      const next = { ...prev };
      delete next[activeServerId];
      return next;
    });
  }, [activeServerId]);

  // Fetch initial presence for guild members and friends
  useEffect(() => {
    if (!accessToken) return;
    const ids = new Set();
    (guildState?.members || []).forEach((m) => m.id && ids.add(m.id));
    (friends || []).forEach((f) => f.id && ids.add(f.id));
    const userIds = [...ids];
    if (userIds.length === 0) return;
    const params = new URLSearchParams({ userIds: userIds.join(",") });
    fetch(`${CORE_API}/v1/presence?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (data && typeof data === "object")
          setPresenceByUserId((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, [accessToken, guildState?.members, friends]);

  // Handle invite links from /join/:code (plus legacy ?join=CODE).
  // External links auto-join once after auth; manual invite previews still require explicit accept.
  useEffect(() => {
    const codeFromLocation = getInviteCodeFromCurrentLocation();
    const pendingCode = parseInviteCodeFromInput(
      codeFromLocation || invitePendingCode || "",
    );
    if (!pendingCode) return;

    if (joinInviteCode !== pendingCode) setJoinInviteCode(pendingCode);
    if (invitePendingCode !== pendingCode) setInvitePendingCode(pendingCode);
    if (codeFromLocation && !invitePendingAutoJoin)
      setInvitePendingAutoJoin(true);

    if (!accessToken) {
      if (codeFromLocation) {
        setStatus("Log in to join this server invite.");
        navigateAppRoute(APP_ROUTE_LOGIN, { replace: true });
      }
      return;
    }

    if (!invitePendingAutoJoin) return;
    if (autoJoinInviteAttemptRef.current === pendingCode) return;

    autoJoinInviteAttemptRef.current = pendingCode;
    setInvitePendingAutoJoin(false);

    joinInvite(pendingCode)
      .catch(() => {})
      .finally(() => {
        if (autoJoinInviteAttemptRef.current === pendingCode) {
          autoJoinInviteAttemptRef.current = "";
        }
      });

    if (routePath !== APP_ROUTE_CLIENT) {
      navigateAppRoute(APP_ROUTE_CLIENT, { replace: true });
    }
  }, [
    accessToken,
    invitePendingCode,
    invitePendingAutoJoin,
    joinInviteCode,
    routePath,
  ]);

  // Handle boost gift link: /gift/:code — prompt preview and require explicit redeem confirmation.
  useEffect(() => {
    const code = getBoostGiftCodeFromCurrentLocation();
    if (!code) return;
    setBoostGiftCode(code);
    if (accessToken) {
      previewBoostGift(code);
    }
    const nextRoute = accessToken ? APP_ROUTE_CLIENT : APP_ROUTE_LOGIN;
    navigateAppRoute(nextRoute, { replace: true });
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const visibleMessages = [
      ...(messages || []),
      ...(dms.find((item) => item.id === activeDmId)?.messages || []),
    ];
    const candidateUrls = new Set();
    for (const message of visibleMessages) {
      for (const url of extractHttpUrls(message?.content || ""))
        candidateUrls.add(url);
      if (Array.isArray(message?.linkEmbeds)) {
        for (const embed of message.linkEmbeds) {
          if (embed?.url) candidateUrls.add(embed.url);
        }
      }
    }

    for (const url of candidateUrls) {
      if (linkPreviewByUrl[url] !== undefined) continue;
      if (linkPreviewFetchInFlightRef.current.has(url)) continue;
      linkPreviewFetchInFlightRef.current.add(url);
      api(`/v1/link-preview?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((data) => {
          setLinkPreviewByUrl((current) => ({
            ...current,
            [url]: data || null,
          }));
        })
        .catch(() => {
          setLinkPreviewByUrl((current) => ({ ...current, [url]: null }));
        })
        .finally(() => {
          linkPreviewFetchInFlightRef.current.delete(url);
        });
    }
  }, [accessToken, messages, dms, activeDmId, linkPreviewByUrl]);

  useEffect(() => {
    const candidates = [];
    const visibleMessages = [
      ...(messages || []),
      ...(dms.find((item) => item.id === activeDmId)?.messages || []),
    ];
    for (const message of visibleMessages) {
      for (const attachment of message?.attachments || []) {
        if (!attachment?.id) continue;
        const mediaKind = getMediaAssetKind({
          url: attachment?.url || "",
          contentType: attachment?.contentType || "",
        });
        if (!mediaKind) continue;
        if (attachmentPreviewUrlById[attachment.id]) continue;
        if (attachmentPreviewFetchInFlightRef.current.has(attachment.id))
          continue;
        candidates.push(attachment);
      }
    }

    for (const attachment of candidates) {
      attachmentPreviewFetchInFlightRef.current.add(attachment.id);
      const source = String(attachment.url || "");
      const isDmAttachment = /\/v1\/social\/dms\/attachments\//.test(source);
      const authToken = isDmAttachment
        ? accessToken
        : activeServer?.membershipToken;
      if (!authToken) {
        attachmentPreviewFetchInFlightRef.current.delete(attachment.id);
        continue;
      }

      const requestUrl = source.startsWith("http")
        ? source
        : isDmAttachment
          ? `${CORE_API}${source.startsWith("/") ? "" : "/"}${source}`
          : activeServer?.baseUrl
            ? `${activeServer.baseUrl}${source.startsWith("/") ? "" : "/"}${source}`
            : "";
      if (!requestUrl) {
        attachmentPreviewFetchInFlightRef.current.delete(attachment.id);
        continue;
      }

      fetch(requestUrl, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (!blob) return;
          const mediaKind = getMediaAssetKind({
            url: attachment?.url || "",
            contentType: blob.type || attachment.contentType || "",
          });
          if (!mediaKind) return;
          const objectUrl = URL.createObjectURL(blob);
          setAttachmentPreviewUrlById((current) => {
            const existing = current[attachment.id];
            if (existing) URL.revokeObjectURL(objectUrl);
            return existing
              ? current
              : { ...current, [attachment.id]: objectUrl };
          });
        })
        .catch(() => {})
        .finally(() => {
          attachmentPreviewFetchInFlightRef.current.delete(attachment.id);
        });
    }
  }, [
    messages,
    dms,
    activeDmId,
    activeServer?.baseUrl,
    activeServer?.membershipToken,
    accessToken,
    attachmentPreviewUrlById,
  ]);

  useEffect(() => {
    if (!favouriteMediaModalOpen) return;
    const candidates = favouriteMedia.filter((item) => {
      if (!item?.id) return false;
      if (item.sourceKind === "external_url") return false;
      if (favouriteMediaPreviewUrlById[item.id]) return false;
      if (favouriteMediaPreviewFetchInFlightRef.current.has(item.id))
        return false;
      return true;
    });

    for (const item of candidates) {
      const request = resolveFavouriteMediaRequest(item);
      if (!request?.requestUrl) continue;
      favouriteMediaPreviewFetchInFlightRef.current.add(item.id);
      fetch(request.requestUrl, {
        headers: request.headers,
      })
        .then((response) => (response.ok ? response.blob() : null))
        .then((blob) => {
          if (!blob) return;
          if (
            !isImageMimeType(blob.type || item.contentType || "") &&
            !isLikelyImageUrl(item.sourceUrl)
          )
            return;
          const objectUrl = URL.createObjectURL(blob);
          setFavouriteMediaPreviewUrlById((current) => {
            const existing = current[item.id];
            if (existing) URL.revokeObjectURL(objectUrl);
            return existing ? current : { ...current, [item.id]: objectUrl };
          });
        })
        .catch(() => {})
        .finally(() => {
          favouriteMediaPreviewFetchInFlightRef.current.delete(item.id);
        });
    }
  }, [
    favouriteMediaModalOpen,
    favouriteMedia,
    favouriteMediaPreviewUrlById,
    accessToken,
    activeServer?.baseUrl,
    activeServer?.membershipToken,
    activeServerId,
    servers,
  ]);

  useEffect(() => {
    const old = attachmentPreviewUrlByIdRef.current || {};
    Object.values(old).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    attachmentPreviewFetchInFlightRef.current.clear();
    setAttachmentPreviewUrlById({});
  }, [activeServerId, activeChannelId, activeDmId]);

  useEffect(() => {
    if (favouriteMediaModalOpen) return;
    const urls = favouriteMediaPreviewUrlByIdRef.current || {};
    if (!Object.keys(urls).length) return;
    Object.values(urls).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    favouriteMediaPreviewFetchInFlightRef.current.clear();
    favouriteMediaPreviewUrlByIdRef.current = {};
    setFavouriteMediaPreviewUrlById({});
  }, [favouriteMediaModalOpen]);

  useEffect(() => {
    return () => {
      const urls = attachmentPreviewUrlByIdRef.current || {};
      Object.values(urls).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      const favouriteUrls = favouriteMediaPreviewUrlByIdRef.current || {};
      Object.values(favouriteUrls).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      favouriteMediaPreviewFetchInFlightRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer) {
      setGuilds([]);
      if (navMode !== "servers") {
        setGuildState(null);
        setMessages([]);
      }
      return;
    }

    nodeApi(activeServer.baseUrl, "/v1/guilds", activeServer.membershipToken)
      .then((items) => {
        const nextGuilds = items || [];
        setGuilds(nextGuilds);

        if (!nextGuilds.length) {
          setActiveGuildId("");
          setGuildState(null);
          return;
        }

        const hasActiveGuild = nextGuilds.some(
          (guild) => guild.id === activeGuildId,
        );
        if (!hasActiveGuild) {
          setActiveGuildId(nextGuilds[0].id);
        }
      })
      .catch((error) => {
        setGuilds([]);
        setGuildState(null);
        setStatus(`Server data failed to load: ${error.message}`);
      });
  }, [activeServer, activeGuildId, navMode]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeGuildId) return;

    let cancelled = false;

    const loadGuildState = () =>
      nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      )
        .then((state) => {
          if (cancelled) return;
          const allChannels = state.channels || [];
          setGuildState(state);

          const activeExists = allChannels.some(
            (channel) => channel.id === activeChannelId,
          );
          if (activeExists) return;

          const firstTextChannel =
            allChannels.find((channel) => channel.type === "text")?.id || "";
          setActiveChannelId(firstTextChannel);
        })
        .catch((error) => {
          if (cancelled) return;
          setGuildState(null);
          setActiveChannelId("");
          setMessages([]);
          setStatus(`Server state failed to load: ${error.message}`);
        });

    loadGuildState();
    const timer = nodeGatewayConnectedForActiveServer
      ? null
      : window.setInterval(loadGuildState, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [
    activeServer,
    activeGuildId,
    navMode,
    activeChannelId,
    nodeGatewayConnectedForActiveServer,
  ]);

  useEffect(() => {
    if (navMode !== "dms" || !activeDmId || !accessToken) return;
    const threadId = activeDmId;
    let cancelled = false;
    dmHistoryLoadingByThreadRef.current[threadId] = false;

    const path = buildPaginatedPath(`/v1/social/dms/${threadId}/messages`, {
      limit: MESSAGE_PAGE_SIZE,
    });
    api(path, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((data) => {
        if (cancelled || activeDmIdRef.current !== threadId) return;
        const nextMessages = Array.isArray(data?.messages) ? data.messages : [];
        const hasMore =
          data?.hasMore != null
            ? !!data.hasMore
            : nextMessages.length >= MESSAGE_PAGE_SIZE;
        dmHistoryHasMoreByThreadRef.current[threadId] = hasMore;
        setDms((current) =>
          current.map((item) =>
            item.id === threadId ? { ...item, messages: nextMessages } : item,
          ),
        );
      })
      .catch(() => {
        // keep existing local messages as fallback
      });

    return () => {
      cancelled = true;
    };
  }, [activeDmId, navMode, accessToken]);

  useEffect(() => {
    if (navMode !== "dms") return;
    if (!dms.length) {
      setActiveDmId("");
      return;
    }
    if (!activeDmId || !dms.some((dm) => dm.id === activeDmId)) {
      setActiveDmId(dms[0].id);
    }
  }, [navMode, dms, activeDmId]);

  useEffect(() => {
    if (!dmNotification) return;
    const t = setTimeout(() => setDmNotification(null), 4000);
    return () => clearTimeout(t);
  }, [dmNotification]);

  useEffect(() => {
    const currentVoiceUsesPrivateGateway = !!activePrivateCall?.callId;
    const canSendVoiceSpeaking =
      isInVoiceChannel &&
      isVoiceSessionSynced &&
      !!voiceConnectedGuildId &&
      (currentVoiceUsesPrivateGateway
        ? !!privateCallGatewayReadyRef.current &&
          privateCallGatewayWsRef.current?.readyState === WebSocket.OPEN
        : !!nodeGatewayReadyRef.current &&
          nodeGatewayWsRef.current?.readyState === WebSocket.OPEN);

    if (
      !isInVoiceChannel ||
      !isVoiceSessionSynced ||
      !voiceConnectedGuildId ||
      isMuted ||
      isDeafened ||
      !navigator.mediaDevices?.getUserMedia ||
      !canSendVoiceSpeaking
    ) {
      const detector = voiceSpeakingDetectorRef.current;
      if (detector.timer) clearInterval(detector.timer);
      detector.timer = null;
      if (
        detector.stream &&
        detector.stream !== voiceSfuRef.current?.getLocalStream()
      )
        detector.stream.getTracks().forEach((t) => t.stop());
      detector.stream = null;
      if (detector.audioCtx) detector.audioCtx.close().catch(() => {});
      detector.audioCtx = null;
      detector.analyser = null;
      detector.lastSpeaking = false;
      if (voiceConnectedGuildId && me?.id) {
        setVoiceSpeakingByGuild((prev) => ({
          ...prev,
          [voiceConnectedGuildId]: {
            ...(prev[voiceConnectedGuildId] || {}),
            [me.id]: false,
          },
        }));
      }
      if (isInVoiceChannel && voiceConnectedGuildId && canSendVoiceSpeaking) {
        void sendNodeVoiceDispatch("VOICE_SPEAKING", {
          guildId: voiceConnectedGuildId,
          channelId: voiceConnectedChannelId,
          speaking: false,
        }).catch(() => {});
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stream =
          voiceSfuRef.current?.getLocalStream() ||
          (await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: !!noiseSuppressionEnabled,
              autoGainControl: true,
              ...(audioInputDeviceId
                ? { deviceId: { exact: audioInputDeviceId } }
                : {}),
            },
          }));
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const audioCtx = new window.AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        const detector = voiceSpeakingDetectorRef.current;
        detector.stream = stream;
        detector.audioCtx = audioCtx;
        detector.analyser = analyser;
        detector.lastSpeaking = false;

        const data = new Uint8Array(analyser.fftSize);
        detector.timer = setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const n = (data[i] - 128) / 128;
            sum += n * n;
          }
          const rms = Math.sqrt(sum / data.length);
          const threshold =
            0.01 +
            ((100 - Math.max(0, Math.min(100, micSensitivity))) / 100) * 0.03;
          const speaking = rms > threshold;
          if (speaking === detector.lastSpeaking) return;
          detector.lastSpeaking = speaking;

          if (voiceConnectedGuildId && me?.id) {
            setVoiceSpeakingByGuild((prev) => ({
              ...prev,
              [voiceConnectedGuildId]: {
                ...(prev[voiceConnectedGuildId] || {}),
                [me.id]: speaking,
              },
            }));
          }
          if (
            isInVoiceChannel &&
            voiceConnectedGuildId &&
            (currentVoiceUsesPrivateGateway
              ? privateCallGatewayReadyRef.current &&
                privateCallGatewayWsRef.current?.readyState === WebSocket.OPEN
              : nodeGatewayReadyRef.current &&
                nodeGatewayWsRef.current?.readyState === WebSocket.OPEN)
          ) {
            void sendNodeVoiceDispatch("VOICE_SPEAKING", {
              guildId: voiceConnectedGuildId,
              channelId: voiceConnectedChannelId,
              speaking,
            }).catch(() => {});
          }
        }, 150);
      } catch {
        setStatus(
          "Mic speaking detection unavailable. Check microphone permissions.",
        );
      }
    })();

    return () => {
      cancelled = true;
      const detector = voiceSpeakingDetectorRef.current;
      if (detector.timer) clearInterval(detector.timer);
      detector.timer = null;
      if (
        detector.stream &&
        detector.stream !== voiceSfuRef.current?.getLocalStream()
      )
        detector.stream.getTracks().forEach((t) => t.stop());
      detector.stream = null;
      if (detector.audioCtx) detector.audioCtx.close().catch(() => {});
      detector.audioCtx = null;
      detector.analyser = null;
      detector.lastSpeaking = false;
    };
  }, [
    isInVoiceChannel,
    isVoiceSessionSynced,
    voiceConnectedGuildId,
    voiceConnectedChannelId,
    isMuted,
    isDeafened,
    micSensitivity,
    audioInputDeviceId,
    noiseSuppressionEnabled,
    me?.id,
    activePrivateCall?.callId,
  ]);

  useEffect(() => {
    localStorage.setItem(MIC_GAIN_KEY, String(micGain));
  }, [micGain]);

  useEffect(() => {
    voiceSfuRef.current?.setMicGain?.(micGain);
  }, [micGain]);

  useEffect(() => {
    localStorage.setItem(MIC_SENSITIVITY_KEY, String(micSensitivity));
  }, [micSensitivity]);

  useEffect(() => {
    localStorage.setItem(AUDIO_INPUT_DEVICE_KEY, audioInputDeviceId || "");
  }, [audioInputDeviceId]);

  useEffect(() => {
    if (!isInVoiceChannel) return;
    voiceSfuRef.current?.setAudioInputDevice?.(audioInputDeviceId).catch(() => {
      setStatus("Could not switch microphone device on current voice session.");
    });
  }, [audioInputDeviceId, isInVoiceChannel]);

  useEffect(() => {
    localStorage.setItem(AUDIO_OUTPUT_DEVICE_KEY, audioOutputDeviceId || "");
  }, [audioOutputDeviceId]);

  useEffect(() => {
    localStorage.setItem(
      NOISE_SUPPRESSION_KEY,
      noiseSuppressionEnabled ? "1" : "0",
    );
  }, [noiseSuppressionEnabled]);

  useEffect(() => {
    localStorage.setItem(
      VOICE_NOISE_CANCELLATION_MODE_KEY,
      noiseCancellationMode,
    );
  }, [noiseCancellationMode]);

  useEffect(() => {
    localStorage.setItem(NOISE_SUPPRESSION_PRESET_KEY, noiseSuppressionPreset);
  }, [noiseSuppressionPreset]);

  useEffect(() => {
    localStorage.setItem(
      NOISE_SUPPRESSION_CONFIG_KEY,
      JSON.stringify(noiseSuppressionConfig),
    );
  }, [noiseSuppressionConfig]);

  useEffect(() => {
    voiceSfuRef.current?.setNoiseSuppressionConfig?.({
      preset: noiseSuppressionPreset,
      config: noiseSuppressionConfig,
    });
  }, [noiseSuppressionPreset, noiseSuppressionConfig]);

  useEffect(() => {
    if (
      noiseCancellationMode !== "smart" ||
      !noiseSuppressionEnabled ||
      !smartNoiseSuppressionProfile
    ) {
      return;
    }
    const nextPreset = smartNoiseSuppressionProfile.preset;
    const nextConfig = normalizeNoiseSuppressionConfigForUi(
      smartNoiseSuppressionProfile.config,
      nextPreset,
    );
    if (noiseSuppressionPreset !== nextPreset) {
      setNoiseSuppressionPreset(nextPreset);
    }
    if (!isNoiseSuppressionConfigEquivalent(noiseSuppressionConfig, nextConfig)) {
      setNoiseSuppressionConfig(nextConfig);
    }
  }, [
    noiseCancellationMode,
    noiseSuppressionEnabled,
    noiseSuppressionPreset,
    noiseSuppressionConfig,
    smartNoiseSuppressionProfile,
  ]);

  useEffect(() => {
    if (!isInVoiceChannel) return;
    voiceSfuRef.current
      ?.setNoiseSuppression?.(noiseSuppressionEnabled)
      .catch((error) => {
        const reason = String(error?.message || "").trim();
        setStatus(
          reason
            ? `Could not apply noise suppression: ${reason}`
            : "Could not apply noise suppression on current microphone track.",
        );
      });
  }, [noiseSuppressionEnabled, isInVoiceChannel]);

  useEffect(() => {
    voiceSfuRef.current?.setMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    voiceSfuRef.current?.setDeafened(isDeafened);
  }, [isDeafened]);

  useEffect(() => {
    if (!isMicMonitorActive) return;
    if (!isMuted || !isDeafened) {
      stopMicMonitor({ restoreState: false, announce: true }).catch(() => {});
    }
  }, [isMicMonitorActive, isMuted, isDeafened]);

  useEffect(() => {
    if (!isMicMonitorActive || isInVoiceChannel) return;
    stopMicMonitor({ restoreState: false, announce: false }).catch(() => {});
  }, [isMicMonitorActive, isInVoiceChannel]);

  useEffect(() => {
    voiceSfuRef.current?.setAudioOutputDevice(audioOutputDeviceId);
  }, [audioOutputDeviceId]);

  useEffect(() => {
    if (!activeGuildId) return;
    const guildPrefs = voiceMemberAudioPrefsByGuild?.[activeGuildId] || {};
    for (const [userId, pref] of Object.entries(guildPrefs)) {
      voiceSfuRef.current?.setUserAudioPreference(userId, pref);
    }
  }, [activeGuildId, voiceMemberAudioPrefsByGuild, isDeafened]);

  useEffect(() => {
    if (!isInVoiceChannel) setLocalAudioProcessingInfo(null);
  }, [isInVoiceChannel]);

  useEffect(() => {
    if (
      settingsTab !== "voice" ||
      !settingsOpen ||
      !navigator.mediaDevices?.enumerateDevices
    )
      return;
    let cancelled = false;
    const loadDevices = async () => {
      try {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          // still attempt enumerateDevices even if permission is denied
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const ins = devices.filter((d) => d.kind === "audioinput");
        const outs = devices.filter((d) => d.kind === "audiooutput");
        setAudioInputDevices(ins);
        setAudioOutputDevices(outs);
        if (!audioInputDeviceId && ins[0]?.deviceId)
          setAudioInputDeviceId(ins[0].deviceId);
        if (!audioOutputDeviceId && outs[0]?.deviceId)
          setAudioOutputDeviceId(outs[0].deviceId);
      } catch {
        if (!cancelled)
          setStatus("Could not load audio devices. Check browser permissions.");
      }
    };
    loadDevices();
    return () => {
      cancelled = true;
    };
  }, [settingsTab, settingsOpen, audioInputDeviceId, audioOutputDeviceId]);

  useEffect(() => {
    if (!me?.id) return;

    let detectedGuildId = "";
    let detectedChannelId = "";

    for (const [guildId, byUser] of Object.entries(voiceStatesByGuild || {})) {
      const selfState = byUser?.[me.id];
      if (selfState?.channelId) {
        detectedGuildId = guildId;
        detectedChannelId = selfState.channelId;
        break;
      }
    }

    if (!detectedChannelId) {
      const selfState = mergedVoiceStates.find((vs) => vs.userId === me.id);
      if (selfState?.channelId) {
        detectedGuildId = activeGuildId || voiceConnectedGuildId || "";
        detectedChannelId = selfState.channelId;
      }
    }

    setVoiceSession((prev) => {
      if (detectedChannelId) {
        if (
          prev.guildId === detectedGuildId &&
          prev.channelId === detectedChannelId
        )
          return prev;
        return { guildId: detectedGuildId, channelId: detectedChannelId };
      }
      if (prev.guildId && prev.guildId !== activeGuildId) return prev;
      if (!prev.guildId && !prev.channelId) return prev;
      return { guildId: "", channelId: "" };
    });
  }, [
    mergedVoiceStates,
    voiceStatesByGuild,
    me?.id,
    activeGuildId,
    voiceConnectedGuildId,
  ]);

  useEffect(() => {
    if (voiceConnectedGuildId && voiceConnectedChannelId) {
      voiceSessionStartedAtRef.current = Date.now();
      voiceServerDesyncMissesRef.current = 0;
      return;
    }
    voiceSessionStartedAtRef.current = 0;
    voiceServerDesyncMissesRef.current = 0;
    voiceRecoveringRef.current = false;
  }, [voiceConnectedGuildId, voiceConnectedChannelId]);

  useEffect(() => {
    if (!voiceConnectedGuildId || !voiceConnectedChannelId) return;
    if (isDisconnectingVoice) return;
    if (activePrivateCall?.callId) return;
    const server = voiceConnectedServer || activeServer;
    if (!server?.baseUrl || !server?.membershipToken) return;

    let cancelled = false;
    let pollInFlight = false;
    let intervalId = null;
    const attemptAutoRecover = async (statusMessage) => {
      const now = Date.now();
      if (voiceRecoveringRef.current) return false;
      if (now - voiceLastRecoverAttemptAtRef.current < 12000) return false;
      if (!canUseRealtimeVoiceGateway()) return false;
      voiceRecoveringRef.current = true;
      voiceLastRecoverAttemptAtRef.current = now;
      try {
        setStatus(statusMessage);
        await voiceSfuRef.current?.join({
          guildId: voiceConnectedGuildId,
          channelId: voiceConnectedChannelId,
          audioInputDeviceId,
          micGain,
          noiseSuppression: noiseSuppressionEnabled,
          noiseSuppressionPreset,
          noiseSuppressionConfig,
          isMuted,
          isDeafened,
          audioOutputDeviceId,
        });
        if (cancelled) return true;
        voiceSessionStartedAtRef.current = Date.now();
        voiceServerDesyncMissesRef.current = 0;
        setStatus("Voice reconnected.");
        return true;
      } catch {
        return false;
      } finally {
        voiceRecoveringRef.current = false;
      }
    };

    const reconcileVoiceState = async () => {
      try {
        const data = await nodeApi(
          server.baseUrl,
          "/v1/me/voice-state",
          server.membershipToken,
        );
        if (cancelled) return;
        const serverVoiceStates = Array.isArray(data?.voiceStates)
          ? data.voiceStates
          : [];
        const hasMatchingServerState = serverVoiceStates.some((state) => {
          const guildId = state?.guildId || state?.guild_id || "";
          const channelId = state?.channelId || state?.channel_id || "";
          return (
            guildId === voiceConnectedGuildId &&
            channelId === voiceConnectedChannelId
          );
        });
        const sessionAgeMs = voiceSessionStartedAtRef.current
          ? Date.now() - voiceSessionStartedAtRef.current
          : 0;

        if (hasMatchingServerState) {
          voiceServerDesyncMissesRef.current = 0;
          const localContext = voiceSfuRef.current?.getContext?.() || {};
          const localHealthy =
            localContext.guildId === voiceConnectedGuildId &&
            localContext.channelId === voiceConnectedChannelId &&
            !!voiceSfuRef.current?.getLocalStream?.();
          if (localHealthy || sessionAgeMs < 8000) return;
          await attemptAutoRecover("Voice media dropped. Reconnecting...");
          return;
        }

        voiceServerDesyncMissesRef.current += 1;
        if (sessionAgeMs < 15000 || voiceServerDesyncMissesRef.current < 2)
          return;

        const recovered = await attemptAutoRecover(
          "Voice connection desynced. Reconnecting...",
        );
        if (recovered) return;
        if (voiceServerDesyncMissesRef.current < 4) return;

        setVoiceSession((prev) => {
          if (
            prev.guildId !== voiceConnectedGuildId ||
            prev.channelId !== voiceConnectedChannelId
          )
            return prev;
          return { guildId: "", channelId: "" };
        });
        await cleanupVoiceRtc();
        voiceServerDesyncMissesRef.current = 0;
        setStatus("Voice session ended on the server. Local state re-synced.");
      } catch {
        // Keep local session on transient API failures; next pass can reconcile.
      }
    };

    const runReconcile = () => {
      if (pollInFlight) return;
      pollInFlight = true;
      reconcileVoiceState()
        .catch(() => {})
        .finally(() => {
          pollInFlight = false;
        });
    };

    runReconcile();
    intervalId = setInterval(() => {
      runReconcile();
    }, 10000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    voiceConnectedGuildId,
    voiceConnectedChannelId,
    voiceConnectedServer,
    activeServer,
    activePrivateCall?.callId,
    isDisconnectingVoice,
    audioInputDeviceId,
    micGain,
    noiseSuppressionEnabled,
    noiseSuppressionPreset,
    noiseSuppressionConfig,
    isMuted,
    isDeafened,
    audioOutputDeviceId,
  ]);

  useEffect(() => {
    if (!accessToken || (navMode !== "friends" && navMode !== "dms")) return;
    refreshSocialData(accessToken).catch(() => {
      // keep existing state on transient failures
    });
  }, [accessToken, navMode]);

  activeChannelIdRef.current = activeChannelId;
  activeGuildIdRef.current = activeGuildId;
  activeServerIdRef.current = activeServerId;
  activeDmIdRef.current = activeDmId;

  useEffect(() => {
    const previousServerId = previousSelectedServerIdRef.current;
    if (previousServerId === activeServerId) return;
    previousSelectedServerIdRef.current = activeServerId;
    if (!previousServerId) return;

    setActiveGuildId("");
    setActiveChannelId("");
    setGuildState(null);
    setMessages([]);
  }, [activeServerId]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("opencom-voice-state-change", {
        detail: {
          connected: !!voiceSession.channelId,
          guildId: voiceSession.guildId || "",
          channelId: voiceSession.channelId || "",
          muted: !!isMuted,
          deafened: !!isDeafened,
          cameraEnabled: !!isCameraEnabled,
          screenSharing: !!isScreenSharing,
        },
      }),
    );
  }, [
    voiceSession.guildId,
    voiceSession.channelId,
    isMuted,
    isDeafened,
    isCameraEnabled,
    isScreenSharing,
  ]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeChannelId) {
      if (navMode !== "servers") setMessages([]);
      return;
    }

    let cancelled = false;
    const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
    serverHistoryLoadingByChannelRef.current[channelKey] = false;

    const loadChannelMessages = (mode = "replace") => {
      const path = buildPaginatedPath(
        `/v1/channels/${activeChannelId}/messages`,
        { limit: MESSAGE_PAGE_SIZE },
      );
      return nodeApi(activeServer.baseUrl, path, activeServer.membershipToken)
        .then((data) => {
          if (cancelled) return;
          setStatus("");
          const fetched = Array.isArray(data?.messages) ? data.messages : [];
          const latestMessages = fetched.slice().reverse();
          const hasMore =
            data?.hasMore != null
              ? !!data.hasMore
              : fetched.length >= MESSAGE_PAGE_SIZE;
          serverHistoryHasMoreByChannelRef.current[channelKey] = hasMore;
          if (mode === "replace") {
            setMessages(latestMessages);
            return;
          }
          setMessages((current) =>
            mergeMessagesChronologically(
              current,
              latestMessages,
              (message) => message.created_at || message.createdAt,
            ),
          );
        })
        .catch((error) => {
          if (cancelled) return;
          if (error?.message?.startsWith("HTTP_403")) {
            setMessages([]);
            serverHistoryHasMoreByChannelRef.current[channelKey] = false;
            setStatus("You no longer have access to that channel.");
            setActiveChannelId("");
            return;
          }
          if (error?.message?.startsWith("HTTP_404")) {
            setMessages([]);
            serverHistoryHasMoreByChannelRef.current[channelKey] = false;
            setStatus(
              "That channel no longer exists. Switching to an available channel.",
            );
            setActiveChannelId("");
            return;
          }
          setStatus(`Message fetch failed: ${error.message}`);
        });
    };

    loadChannelMessages("replace");
    const timer = nodeGatewayConnectedForActiveServer
      ? null
      : window.setInterval(() => {
          loadChannelMessages("merge").catch(() => {});
        }, 2000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [
    activeServer,
    activeGuildId,
    activeChannelId,
    navMode,
    nodeGatewayConnectedForActiveServer,
  ]);

  useEffect(() => {
    if (navMode !== "servers" || !activeServer || !activeChannelId) return;
    loadServerPins(activeChannelId).catch(() => {});
  }, [navMode, activeServer, activeChannelId]);

  useEffect(() => {
    setPendingAttachments([]);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }, [activeServerId, activeChannelId]);

  useEffect(() => {
    setPendingDmAttachments([]);
    if (dmAttachmentInputRef.current) dmAttachmentInputRef.current.value = "";
  }, [activeDmId]);

  useEffect(() => {
    if (
      navMode !== "servers" ||
      !accessToken ||
      !activeGuildId ||
      gatewayConnected
    )
      return;

    let cancelled = false;

    const loadGuildPresence = () => {
      const memberIds = Array.from(
        new Set((guildState?.members || []).map((m) => m?.id).filter(Boolean)),
      );
      if (!memberIds.length) return;
      const params = new URLSearchParams({ userIds: memberIds.join(",") });
      fetch(`${CORE_API}/v1/presence?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : {}))
        .then((data) => {
          if (cancelled || !data || typeof data !== "object") return;
          setPresenceByUserId((prev) => ({ ...prev, ...data }));
        })
        .catch(() => {});
    };

    loadGuildPresence();
    const timer = window.setInterval(loadGuildPresence, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    navMode,
    accessToken,
    activeGuildId,
    guildState?.members,
    gatewayConnected,
  ]);

  // Fallback polling for social presence/RPC only when core gateway websocket is unavailable.
  useEffect(() => {
    if (
      !accessToken ||
      gatewayConnected ||
      (navMode !== "friends" && navMode !== "dms")
    )
      return;

    let cancelled = false;

    const loadSocialPresence = () => {
      const ids = new Set();
      (friends || []).forEach((friend) => friend?.id && ids.add(friend.id));
      (dms || []).forEach(
        (dm) => dm?.participantId && ids.add(dm.participantId),
      );
      const userIds = [...ids];
      if (!userIds.length) return;

      const params = new URLSearchParams({ userIds: userIds.join(",") });
      fetch(`${CORE_API}/v1/presence?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => (r.ok ? r.json() : {}))
        .then((data) => {
          if (cancelled || !data || typeof data !== "object") return;
          setPresenceByUserId((prev) => ({ ...prev, ...data }));
        })
        .catch(() => {});
    };

    loadSocialPresence();
    const timer = window.setInterval(loadSocialPresence, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, gatewayConnected, navMode, friends, dms]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const nextResetPasswordToken = params.get("resetPasswordToken");
    if (!nextResetPasswordToken) return;
    if (getAppRouteFromLocation() === APP_ROUTE_HOME) {
      navigateAppRoute(APP_ROUTE_LOGIN, { replace: true });
    }
    setResetPasswordToken(nextResetPasswordToken);
    setAuthMode("reset-password");
    setPassword("");
    setAuthResetPasswordConfirm("");
    setStatus("Reset link ready. Choose a new password.");

    params.delete("resetPasswordToken");
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const verifyEmailToken = params.get("verifyEmailToken");
    if (!verifyEmailToken) return;
    if (getAppRouteFromLocation() === APP_ROUTE_HOME) {
      navigateAppRoute(APP_ROUTE_LOGIN, { replace: true });
    }

    setStatus("Verifying your email...");
    api("/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: verifyEmailToken }),
    })
      .then(() => {
        setAuthMode("login");
        setStatus("Email verified. You can now log in.");
      })
      .catch((error) => {
        setStatus(`Email verification failed: ${error.message}`);
      })
      .finally(() => {
        params.delete("verifyEmailToken");
        const next = params.toString();
        const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
        window.history.replaceState({}, "", nextUrl);
      });
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const params = new URLSearchParams(window.location.search || "");
    const action = params.get("boostGiftCheckout");
    const giftId = params.get("giftId");
    const sessionId = params.get("session_id");
    if (!action) return;

    if (action === "success" && giftId && sessionId) {
      completeBoostGiftCheckout(giftId, sessionId).catch(() => {});
    } else if (action === "cancel") {
      setStatus("Boost gift checkout canceled.");
    }

    params.delete("boostGiftCheckout");
    params.delete("giftId");
    params.delete("session_id");
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [accessToken]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setStatus(
      authMode === "forgot-password"
        ? "Sending reset link..."
        : authMode === "reset-password"
          ? "Resetting password..."
          : "Authenticating...",
    );

    try {
      if (authMode === "forgot-password") {
        await requestPasswordReset(email.trim());
        return;
      }

      if (authMode === "reset-password") {
        if (!resetPasswordToken) {
          setStatus("This reset link is missing or invalid. Request a new one.");
          return;
        }
        if (password !== authResetPasswordConfirm) {
          setStatus("Passwords do not match.");
          return;
        }
        if (password.length < 8) {
          setStatus("Password must be at least 8 characters.");
          return;
        }

        await api("/v1/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: resetPasswordToken, newPassword: password }),
        });
        setAccessToken("");
        setRefreshToken("");
        setMe(null);
        setPendingVerificationEmail("");
        setResetPasswordToken("");
        setPassword("");
        setAuthResetPasswordConfirm("");
        setAuthMode("login");
        setStatus("Password reset. Log in with your new password.");
        return;
      }

      if (authMode === "register") {
        await api("/v1/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, username, password }),
        });
        setPendingVerificationEmail(email.trim());
        setAuthMode("login");
        setPassword("");
        setStatus(
          "Account created. Check your email for a verification link before logging in.",
        );
        return;
      }

      const loginData = await api("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(loginData.accessToken);
      setRefreshToken(loginData.refreshToken || "");
      setMe(loginData.user);
      setPendingVerificationEmail("");
      setStatus("Authenticated.");
    } catch (error) {
      if (error?.message === "EMAIL_NOT_VERIFIED") {
        setPendingVerificationEmail(email.trim());
        setStatus(
          "Auth failed: EMAIL_NOT_VERIFIED. Use the resend button below if needed.",
        );
        return;
      }
      if (error?.message === "SMTP_NOT_CONFIGURED") {
        setStatus(
          "Auth failed: SMTP is not configured on the API server, so verification emails cannot be sent yet.",
        );
        return;
      }
      if (error?.message === "SMTP_AUTH_FAILED") {
        setStatus(
          "Auth failed: SMTP auth failed. Check Zoho SMTP username/app password.",
        );
        return;
      }
      if (error?.message === "SMTP_CONNECTION_FAILED") {
        setStatus(
          "Auth failed: SMTP connection failed. Check server network + SMTP host/port/TLS.",
        );
        return;
      }
      setStatus(`Auth failed: ${error.message}`);
    }
  }

  async function requestPasswordReset(targetEmail = "") {
    const normalizedEmail = String(targetEmail || "").trim();
    if (!normalizedEmail) {
      setStatus("Enter your email first.");
      return;
    }

    try {
      await api("/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
      });
      setEmail(normalizedEmail);
      setAuthMode("login");
      setStatus("If the account exists, a password reset link has been sent.");
    } catch (error) {
      if (error?.message === "SMTP_NOT_CONFIGURED") {
        setStatus(
          "Reset failed: SMTP is not configured on the API server. Set SMTP_* (or Zoho SMTP envs) and restart backend.",
        );
        return;
      }
      if (error?.message === "SMTP_AUTH_FAILED") {
        setStatus(
          "Reset failed: SMTP auth failed. Check Zoho username and app password.",
        );
        return;
      }
      if (error?.message === "SMTP_CONNECTION_FAILED") {
        setStatus(
          "Reset failed: could not connect to SMTP server. Check host/port/TLS/firewall.",
        );
        return;
      }
      setStatus(`Reset failed: ${error.message}`);
    }
  }

  async function handleResendVerification() {
    const targetEmail = (pendingVerificationEmail || email || "").trim();
    if (!targetEmail) {
      setStatus("Enter your email first, then resend verification.");
      return;
    }
    setStatus("Sending verification email...");
    try {
      await api("/v1/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: targetEmail }),
      });
      setPendingVerificationEmail(targetEmail);
      setStatus(
        "If the account exists and is unverified, a new verification email has been sent.",
      );
    } catch (error) {
      if (error?.message === "SMTP_NOT_CONFIGURED") {
        setStatus(
          "Resend failed: SMTP is not configured on the API server. Set SMTP_* (or Zoho SMTP envs) and restart backend.",
        );
        return;
      }
      if (error?.message === "SMTP_AUTH_FAILED") {
        setStatus(
          "Resend failed: SMTP auth failed. Check Zoho username and app password.",
        );
        return;
      }
      if (error?.message === "SMTP_CONNECTION_FAILED") {
        setStatus(
          "Resend failed: could not connect to SMTP server. Check host/port/TLS/firewall.",
        );
        return;
      }
      setStatus(`Resend failed: ${error.message}`);
    }
  }

  function applySlashCommandTemplate(command) {
    const template = buildSlashCommandTemplate(command);
    setMessageText(template.text);
    window.requestAnimationFrame(() => {
      const input = composerInputRef.current;
      if (!input) return;
      input.focus();
      const cursor = Math.max(
        0,
        Math.min(template.cursor, template.text.length),
      );
      input.setSelectionRange(cursor, cursor);
    });
  }

  function applyEmoteSuggestion(emoteName) {
    const normalizedName = String(emoteName || "").trim().toLowerCase();
    if (!normalizedName) return;
    const emote = getEmoteQuery(activeComposerText);
    if (!emote) {
      insertEmoteToken(normalizedName);
      return;
    }

    const prefix = activeComposerText.slice(0, emote.start);
    const nextText = `${prefix}:${normalizedName}: `;
    if (navMode === "dms") setDmText(nextText);
    else setMessageText(nextText);
    setShowEmotePicker(false);
    window.requestAnimationFrame(() => {
      const input = activeComposerInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextText.length, nextText.length);
    });
  }

  async function executeSlashCommand(rawInput) {
    const { commandToken, argText } = splitSlashInput(rawInput);
    if (!commandToken) return false;

    const resolved = resolveSlashCommand(commandToken, serverExtensionCommands);
    if (!resolved.command && resolved.ambiguousMatches.length > 1) {
      setStatus(
        `Ambiguous command /${commandToken}. Use one of: ${resolved.ambiguousMatches.map((item) => `/${item.name}`).join(", ")}`,
      );
      return true;
    }
    if (!resolved.command) {
      setStatus(`Unknown command: /${commandToken}`);
      return true;
    }

    const command = resolved.command;
    const resolvedCommandName = command.name;
    const optionDefs = Array.isArray(command.options) ? command.options : [];
    const args = {};

    try {
      Object.assign(args, parseCommandArgsByOptions(argText, optionDefs));

      optionDefs.forEach((option) => {
        if (!option?.required) return;
        if (!Object.prototype.hasOwnProperty.call(args, option.name)) {
          throw new Error(`Missing required option: ${option.name}`);
        }
      });
    } catch (error) {
      setStatus(`/${commandToken}: ${error.message}`);
      return true;
    }

    try {
      setMessageText("");
      const result = await nodeApi(
        activeServer.baseUrl,
        `/v1/extensions/commands/${encodeURIComponent(resolvedCommandName)}/execute`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({
            args,
            channelId: activeChannelId || undefined,
          }),
        },
      );
      const commandResult = result?.result;
      if (result?.postedMessage?.id && activeChannelId) {
        const path = buildPaginatedPath(
          `/v1/channels/${activeChannelId}/messages`,
          { limit: MESSAGE_PAGE_SIZE },
        );
        const data = await nodeApi(
          activeServer.baseUrl,
          path,
          activeServer.membershipToken,
        );
        const fetched = Array.isArray(data?.messages) ? data.messages : [];
        const latestMessages = fetched.slice().reverse();
        const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
        const hasMore =
          data?.hasMore != null
            ? !!data.hasMore
            : fetched.length >= MESSAGE_PAGE_SIZE;
        serverHistoryHasMoreByChannelRef.current[channelKey] = hasMore;
        setMessages((current) =>
          mergeMessagesChronologically(
            current,
            latestMessages,
            (message) => message.created_at || message.createdAt,
          ),
        );
        setStatus(`Executed /${resolvedCommandName}`);
      } else if (
        commandResult &&
        typeof commandResult === "object" &&
        (commandResult.content || Array.isArray(commandResult.embeds))
      ) {
        setStatus(`Executed /${resolvedCommandName}`);
      } else {
        setStatus(
          `Executed /${resolvedCommandName}${result?.result != null ? ` → ${typeof result.result === "string" ? result.result : JSON.stringify(result.result)}` : ""}`,
        );
      }
    } catch (error) {
      setMessageText(rawInput);
      setStatus(`Command failed: ${error.message}`);
    }

    return true;
  }

  async function loadFavouriteMedia() {
    if (!accessToken) {
      setFavouriteMedia([]);
      return;
    }
    setFavouriteMediaLoading(true);
    try {
      const data = await api("/v1/social/favourites/media", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setFavouriteMedia(Array.isArray(data?.favourites) ? data.favourites : []);
    } catch (error) {
      setStatus(`Could not load favourites: ${error.message}`);
    } finally {
      setFavouriteMediaLoading(false);
    }
  }

  function openFavouriteMediaPicker() {
    setFavouriteMediaModalOpen(true);
    loadFavouriteMedia().catch(() => {});
  }

  function closeKlipyPicker() {
    klipyRequestSeqRef.current += 1;
    setKlipyModalOpen(false);
    setKlipyQuery("");
    setKlipyItems([]);
    setKlipyNext("");
    setKlipyLoading(false);
    setKlipyInsertBusyId("");
  }

  function openKlipyPicker() {
    setKlipyModalOpen(true);
  }

  async function loadKlipyMedia({
    queryText = klipyQuery,
    append = false,
    nextToken = "",
  } = {}) {
    if (!accessToken) {
      setKlipyItems([]);
      setKlipyNext("");
      return;
    }

    const trimmedQuery = String(queryText || "").trim();
    const requestId = ++klipyRequestSeqRef.current;
    setKlipyLoading(true);

    try {
      const viewportWidth =
        typeof window === "undefined"
          ? 360
          : Math.max(320, Math.round(window.innerWidth || 0));
      const viewportHeight =
        typeof window === "undefined"
          ? 640
          : Math.max(480, Math.round(window.innerHeight || 0));
      const pixelRatio =
        typeof window === "undefined"
          ? 1
          : Math.max(1, Number(window.devicePixelRatio || 1));
      const adMaxWidth = Math.max(160, Math.min(viewportWidth - 120, 320));
      const params = new URLSearchParams({
        limit: "24",
        adMinWidth: "160",
        adMaxWidth: String(adMaxWidth),
        adMinHeight: "50",
        adMaxHeight: "250",
        adPosition: "2",
        deviceWidth: String(viewportWidth),
        deviceHeight: String(viewportHeight),
        pixelRatio: pixelRatio.toFixed(2),
      });
      if (nextToken) params.set("pos", nextToken);
      if (trimmedQuery) params.set("q", trimmedQuery);
      const endpoint = trimmedQuery
        ? "/v1/media/klipy/search"
        : "/v1/media/klipy/featured";
      const data = await api(`${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (requestId !== klipyRequestSeqRef.current) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      setKlipyItems((current) =>
        append ? mergeKlipyMediaItems(current, items) : items,
      );
      setKlipyNext(String(data?.next || "").trim());
    } catch (error) {
      if (requestId !== klipyRequestSeqRef.current) return;
      if (!append) {
        setKlipyItems([]);
        setKlipyNext("");
      }
      setStatus(`Could not load Klipy media: ${error.message}`);
    } finally {
      if (requestId === klipyRequestSeqRef.current) {
        setKlipyLoading(false);
      }
    }
  }

  function buildFavouriteMediaDraftFromAttachment(attachment, messageId = "") {
    const sourceUrl = String(attachment?.url || "").trim();
    if (!sourceUrl) return null;
    const isDmAttachment = /\/v1\/social\/dms\/attachments\//.test(sourceUrl);
    const serverId = !isDmAttachment && activeServerId ? activeServerId : undefined;
    const threadId = isDmAttachment && activeDmId ? activeDmId : undefined;
    const favouriteMessageId = messageId || undefined;
    return {
      sourceKind: isDmAttachment ? "dm_attachment" : "server_attachment",
      sourceUrl,
      title: attachment?.fileName || "Image",
      fileName: attachment?.fileName || "",
      contentType: attachment?.contentType || "",
      ...(serverId ? { serverId } : {}),
      ...(threadId ? { threadId } : {}),
      ...(favouriteMessageId ? { messageId: favouriteMessageId } : {}),
    };
  }

  function buildFavouriteMediaDraftFromEmbed(embed) {
    const preview = getLinkPreviewForUrl(embed?.url);
    const imageUrl = String(embed?.imageUrl || preview?.imageUrl || "").trim();
    const fallbackImageUrl =
      !imageUrl && isLikelyImageUrl(embed?.url) ? String(embed.url) : "";
    const resolvedImageUrl = imageUrl || fallbackImageUrl;
    if (!resolvedImageUrl) return null;
    return {
      sourceKind: "external_url",
      sourceUrl: resolvedImageUrl,
      pageUrl: embed?.url || preview?.url || resolvedImageUrl,
      title: embed?.title || preview?.title || guessFileNameFromUrl(resolvedImageUrl),
      fileName: guessFileNameFromUrl(resolvedImageUrl),
      contentType: "",
    };
  }

  function buildFavouriteMediaDraftFromKlipyItem(item) {
    const sourceUrl = String(item?.sourceUrl || "").trim();
    if (!sourceUrl) return null;
    return {
      sourceKind: "external_url",
      sourceUrl,
      pageUrl: item?.pageUrl || sourceUrl,
      title: item?.title || guessFileNameFromUrl(sourceUrl) || "Klipy media",
      fileName: guessFileNameFromUrl(sourceUrl),
      contentType: item?.contentType || "",
    };
  }

  function resolveFavouriteMediaRequest(item) {
    const sourceUrl = String(item?.sourceUrl || "").trim();
    if (!sourceUrl) return null;

    if (item?.sourceKind === "dm_attachment") {
      if (!accessToken) return null;
      return {
        requestUrl: sourceUrl.startsWith("http")
          ? sourceUrl
          : `${CORE_API}${sourceUrl.startsWith("/") ? "" : "/"}${sourceUrl}`,
        headers: { Authorization: `Bearer ${accessToken}` },
      };
    }

    if (item?.sourceKind === "server_attachment") {
      const targetServerId = String(item?.serverId || "").trim();
      const currentServer =
        targetServerId && activeServerId === targetServerId ? activeServer : null;
      const matchedServer =
        currentServer ||
        (serversRef.current || []).find((server) => server.id === targetServerId) ||
        null;
      const baseUrl = normalizeServerBaseUrl(matchedServer?.baseUrl || "");
      const membershipToken = matchedServer?.membershipToken || "";
      if (!baseUrl || !membershipToken) return null;
      return {
        requestUrl: sourceUrl.startsWith("http")
          ? sourceUrl
          : `${baseUrl}${sourceUrl.startsWith("/") ? "" : "/"}${sourceUrl}`,
        headers: { Authorization: `Bearer ${membershipToken}` },
      };
    }

    return {
      requestUrl: sourceUrl,
      headers: {},
    };
  }

  async function fetchFavouriteMediaBlob(item) {
    const request = resolveFavouriteMediaRequest(item);
    if (!request?.requestUrl) throw new Error("MEDIA_UNAVAILABLE");
    const response = await fetch(request.requestUrl, {
      headers: request.headers,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP_${response.status}`);
    }
    return response.blob();
  }

  function buildFavouriteMediaFile(item, blob) {
    const blobType =
      blob?.type || item?.contentType || "application/octet-stream";
    const baseName = String(
      item?.fileName ||
        guessFileNameFromUrl(item?.sourceUrl) ||
        item?.title ||
        "",
    )
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_");
    const fileName =
      baseName || `favourite-${Date.now()}${extensionForMimeType(blobType)}`;
    return new File([blob], fileName, {
      type: blobType,
    });
  }

  function appendTextToActiveComposer(text, scope) {
    const value = String(text || "").trim();
    if (!value) return;
    if (scope === "dm") {
      setDmText((current) =>
        current.trimEnd() ? `${current.trimEnd()} ${value}` : value,
      );
      dmComposerInputRef.current?.focus();
      return;
    }
    setMessageText((current) =>
      current.trimEnd() ? `${current.trimEnd()} ${value}` : value,
    );
    composerInputRef.current?.focus();
  }

  function resolveMediaInsertScope() {
    const scope =
      navMode === "dms" ? "dm" : navMode === "servers" ? "server" : "";
    if (!scope) {
      setStatus("Open a channel or DM to send media.");
      return "";
    }
    if (scope === "server" && (!activeServer || !activeChannelId)) {
      setStatus("Select a server channel first.");
      return "";
    }
    if (scope === "dm" && (!activeDm || activeDm?.isNoReply)) {
      setStatus(
        activeDm?.isNoReply
          ? "This official account does not accept replies."
          : "Select a DM first.",
      );
      return "";
    }
    return scope;
  }

  async function insertKlipyMedia(item) {
    if (String(item?.type || "").trim().toLowerCase() === "ad") {
      setStatus("Klipy advertisements can't be inserted into chat.");
      return;
    }
    const itemKey = String(item?.id || item?.sourceUrl || "").trim();
    const sourceUrl = String(item?.sourceUrl || "").trim();
    if (!itemKey || !sourceUrl) {
      setStatus("Klipy media is missing a usable source URL.");
      return;
    }
    const scope = resolveMediaInsertScope();
    if (!scope) return;

    setKlipyInsertBusyId(itemKey);
    try {
      appendTextToActiveComposer(sourceUrl, scope);
      setStatus("Added Klipy media to the composer.");
      closeKlipyPicker();
    } finally {
      setKlipyInsertBusyId("");
    }
  }

  async function toggleKlipyFavourite(item) {
    if (String(item?.type || "").trim().toLowerCase() === "ad") {
      setStatus("Klipy advertisements can't be saved as favourites.");
      return;
    }
    const draft = buildFavouriteMediaDraftFromKlipyItem(item);
    if (!draft) {
      setStatus("Klipy media is missing a usable source URL.");
      return;
    }
    await toggleFavouriteMedia(draft);
  }

  async function insertFavouriteMedia(item) {
    if (!item?.id) return;
    const scope = resolveMediaInsertScope();
    if (!scope) return;

    setFavouriteMediaInsertBusyId(item.id);
    try {
      if (item.sourceKind === "external_url") {
        appendTextToActiveComposer(item.sourceUrl, scope);
        setStatus("Added saved media to the composer.");
      } else {
        const blob = await fetchFavouriteMediaBlob(item);
        const file = buildFavouriteMediaFile(item, blob);
        await uploadAttachments([file], "favourites", scope);
      }
      setFavouriteMediaModalOpen(false);
    } catch (error) {
      setStatus(`Could not add favourite: ${error.message}`);
    } finally {
      setFavouriteMediaInsertBusyId("");
    }
  }

  useEffect(() => {
    if (!klipyModalOpen) return undefined;
    const delay = String(klipyQuery || "").trim() ? 250 : 0;
    const timer = window.setTimeout(() => {
      loadKlipyMedia({
        queryText: klipyQuery,
        append: false,
      }).catch(() => {});
    }, delay);
    return () => window.clearTimeout(timer);
  }, [klipyModalOpen, klipyQuery, accessToken]);

  async function toggleFavouriteMedia(draft) {
    const key = buildFavouriteMediaKey(draft?.sourceKind, draft?.sourceUrl);
    if (!accessToken || !key) return;

    const existing = favouriteMediaByKey.get(key) || null;
    const pendingId = `pending:${key}`;
    const busy =
      !!favouriteMediaBusyById[key] ||
      (existing?.id ? !!favouriteMediaBusyById[existing.id] : false);
    if (busy) return;

    setFavouriteMediaBusyById((current) => ({
      ...current,
      [key]: true,
      [pendingId]: true,
      ...(existing?.id ? { [existing.id]: true } : {}),
    }));

    if (existing?.id) {
      const rollbackItem = existing;
      setFavouriteMedia((current) =>
        current.filter(
          (item) =>
            item.id !== rollbackItem.id &&
            buildFavouriteMediaKey(item?.sourceKind, item?.sourceUrl) !== key,
        ),
      );

      try {
        await api(`/v1/social/favourites/media/${existing.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        loadFavouriteMedia().catch(() => {});
        setStatus("Removed from favourites.");
      } catch (error) {
        setFavouriteMedia((current) => {
          const alreadyPresent = current.some(
            (item) =>
              item.id === rollbackItem.id ||
              buildFavouriteMediaKey(item?.sourceKind, item?.sourceUrl) === key,
          );
          return alreadyPresent ? current : [rollbackItem, ...current];
        });
        setStatus(`Could not update favourites: ${error.message}`);
      } finally {
        setFavouriteMediaBusyById((current) => {
          const next = { ...current };
          delete next[key];
          delete next[pendingId];
          delete next[rollbackItem.id];
          return next;
        });
      }
      return;
    }

    const optimisticFavourite = {
      id: pendingId,
      sourceKind: draft.sourceKind,
      sourceUrl: normalizeFavouriteMediaUrl(draft.sourceUrl),
      pageUrl: draft.pageUrl || "",
      title: draft.title || "",
      fileName: draft.fileName || "",
      contentType: draft.contentType || "",
      serverId: draft.serverId || "",
      threadId: draft.threadId || "",
      messageId: draft.messageId || "",
      createdAt: toIsoTimestamp(Date.now()),
      updatedAt: toIsoTimestamp(Date.now()),
    };

    setFavouriteMedia((current) => {
      const filtered = current.filter(
        (item) =>
          item.id !== pendingId &&
          buildFavouriteMediaKey(item?.sourceKind, item?.sourceUrl) !== key,
      );
      return [optimisticFavourite, ...filtered];
    });

    try {
      const data = await api("/v1/social/favourites/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(draft),
      });
      const favourite = data?.favourite;
      if (favourite?.id) {
        setFavouriteMedia((current) => {
          const filtered = current.filter(
            (item) =>
              item.id !== pendingId &&
              item.id !== favourite.id &&
              buildFavouriteMediaKey(item?.sourceKind, item?.sourceUrl) !== key,
          );
          return [favourite, ...filtered];
        });
      } else {
        setFavouriteMedia((current) =>
          current.filter((item) => item.id !== pendingId),
        );
      }
      loadFavouriteMedia().catch(() => {});
      setStatus("Saved to favourites.");
    } catch (error) {
      setFavouriteMedia((current) =>
        current.filter((item) => item.id !== pendingId),
      );
      setStatus(`Could not update favourites: ${error.message}`);
    } finally {
      setFavouriteMediaBusyById((current) => {
        const next = { ...current };
        delete next[key];
        delete next[pendingId];
        return next;
      });
    }
  }

  async function uploadServerAttachment(file) {
    if (!activeServer || !activeGuildId || !activeChannelId || !file)
      return null;
    const nextFile = normalizeAttachmentFile(file, "attachment") || file;
    return uploadFileInChunks({
      file: nextFile,
      initUrl: `${activeServer.baseUrl}/v1/attachments/uploads/init`,
      buildChunkUrl: (uploadId, offset) =>
        `${activeServer.baseUrl}/v1/attachments/uploads/${encodeURIComponent(uploadId)}/chunks?offset=${encodeURIComponent(offset)}`,
      completeUrl: (uploadId) =>
        `${activeServer.baseUrl}/v1/attachments/uploads/${encodeURIComponent(uploadId)}/complete`,
      abortUrl: (uploadId) =>
        `${activeServer.baseUrl}/v1/attachments/uploads/${encodeURIComponent(uploadId)}`,
      headers: {
        Authorization: `Bearer ${activeServer.membershipToken}`,
      },
      initBody: {
        guildId: activeGuildId,
        channelId: activeChannelId,
      },
      onProgress: ({ uploadedBytes, totalBytes, complete }) => {
        if (complete) return;
        const percent = totalBytes
          ? Math.max(
              0,
              Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)),
            )
          : 100;
        setStatus(`Uploading ${nextFile.name || "upload.bin"}... ${percent}%`);
      },
    });
  }

  async function uploadDmAttachment(file, threadId) {
    if (!threadId || !file || !accessToken) return null;
    const nextFile = normalizeAttachmentFile(file, "dm-attachment") || file;
    return uploadFileInChunks({
      file: nextFile,
      initUrl: `${CORE_API}/v1/social/dms/${encodeURIComponent(threadId)}/attachments/uploads/init`,
      buildChunkUrl: (uploadId, offset) =>
        `${CORE_API}/v1/social/dms/${encodeURIComponent(threadId)}/attachments/uploads/${encodeURIComponent(uploadId)}/chunks?offset=${encodeURIComponent(offset)}`,
      completeUrl: (uploadId) =>
        `${CORE_API}/v1/social/dms/${encodeURIComponent(threadId)}/attachments/uploads/${encodeURIComponent(uploadId)}/complete`,
      abortUrl: (uploadId) =>
        `${CORE_API}/v1/social/dms/${encodeURIComponent(threadId)}/attachments/uploads/${encodeURIComponent(uploadId)}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      onProgress: ({ uploadedBytes, totalBytes, complete }) => {
        if (complete) return;
        const percent = totalBytes
          ? Math.max(
              0,
              Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)),
            )
          : 100;
        setStatus(`Uploading ${nextFile.name || "upload.bin"}... ${percent}%`);
      },
    });
  }

  function describeAttachmentUploadError(error) {
    const code = String(error?.code || error?.message || "");
    if (code === "TOO_LARGE" && Number.isFinite(error?.maxBytes)) {
      return `File exceeds the ${formatByteCount(error.maxBytes)} upload limit.`;
    }
    if (
      code === "CHUNK_TOO_LARGE" &&
      Number.isFinite(error?.chunkSizeBytes)
    ) {
      return `Upload chunk exceeded ${formatByteCount(error.chunkSizeBytes)}.`;
    }
    if (code === "OFFICIAL_ACCOUNT_NO_REPLY") {
      return "The OpenCom official account is no-reply.";
    }
    if (code === "MISSING_PERMS") {
      return "You do not have permission to attach files here.";
    }
    return "";
  }

  async function uploadAttachments(files, source = "files", scope = "server") {
    const selected = Array.from(files || []).filter(Boolean);
    if (!selected.length) return;
    const isDmScope = scope === "dm";
    const pending = isDmScope ? pendingDmAttachments : pendingAttachments;

    if (isDmScope && activeDm?.isNoReply) {
      setStatus("The OpenCom official account is no-reply.");
      return;
    }

    const availableSlots = Math.max(0, 10 - pending.length);
    if (!availableSlots) {
      setStatus("You can attach up to 10 files per message.");
      return;
    }

    const queue = selected.slice(0, availableSlots);
    let uploaded = 0;
    let failed = 0;

    for (const file of queue) {
      try {
        const nextFile = normalizeAttachmentFile(
          file,
          isDmScope ? "dm-attachment" : "attachment",
        ) || file;
        const fileLabel = nextFile.name || "upload.bin";
        setStatus(`Uploading ${fileLabel}...`);
        // eslint-disable-next-line no-await-in-loop
        const data = isDmScope
          ? await uploadDmAttachment(nextFile, activeDm?.id)
          : await uploadServerAttachment(nextFile);
        if (data) {
          if (isDmScope)
            setPendingDmAttachments((current) => [...current, data]);
          else setPendingAttachments((current) => [...current, data]);
          uploaded += 1;
        }
      } catch (error) {
        failed += 1;
        const detailedMessage = describeAttachmentUploadError(error);
        if (detailedMessage) setStatus(detailedMessage);
        console.warn("Attachment upload failed", error);
      }
    }

    if (uploaded > 0 && failed === 0) {
      setStatus(
        `Attached ${uploaded} file${uploaded === 1 ? "" : "s"} from ${source}.`,
      );
      return;
    }
    if (uploaded > 0) {
      setStatus(
        `Attached ${uploaded} file${uploaded === 1 ? "" : "s"} from ${source}; ${failed} failed.`,
      );
      return;
    }
    setStatus(`Attachment upload failed from ${source}.`);
  }

  async function openMessageAttachment(attachment) {
    if (!attachment?.url) return;
    try {
      const rawUrl = String(attachment.url || "");
      const isDmAttachment = /\/v1\/social\/dms\/attachments\//.test(rawUrl);
      const url = rawUrl.startsWith("http")
        ? rawUrl
        : `${isDmAttachment ? CORE_API : activeServer?.baseUrl || ""}${rawUrl}`;
      if (!url) return;

      const authToken = isDmAttachment
        ? accessToken
        : activeServer?.membershipToken;
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const response = await fetch(url, {
        headers,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP_${response.status}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const popup = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!popup) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = attachment.fileName || "attachment";
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      setStatus(`Attachment open failed: ${error.message || "UNKNOWN_ERROR"}`);
    }
  }

  async function sendMessage() {
    if (!activeServer || !activeChannelId) return;
    const draftContent = normalizeComposerDraft(messageText);
    const hasTextContent = draftContent.trim().length > 0;
    if (!hasTextContent && pendingAttachments.length === 0) return;

    if (draftContent.trimStart().startsWith("/")) {
      await executeSlashCommand(draftContent);
      return;
    }

    const content = `${replyTarget ? `> replying to ${replyTarget.author}: ${replyTarget.content}\n` : ""}${hasTextContent ? draftContent : ""}`;

    try {
      setMessageText("");
      setShowEmotePicker(false);
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${activeChannelId}/messages`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({
            content: content || "Attachment",
            attachmentIds: pendingAttachments
              .map((attachment) => attachment.attachmentId || attachment.id)
              .filter(Boolean),
          }),
        },
      );

      const path = buildPaginatedPath(
        `/v1/channels/${activeChannelId}/messages`,
        { limit: MESSAGE_PAGE_SIZE },
      );
      const data = await nodeApi(
        activeServer.baseUrl,
        path,
        activeServer.membershipToken,
      );
      const fetched = Array.isArray(data?.messages) ? data.messages : [];
      const latestMessages = fetched.slice().reverse();
      const channelKey = `${activeGuildId || ""}:${activeChannelId || ""}`;
      const hasMore =
        data?.hasMore != null
          ? !!data.hasMore
          : fetched.length >= MESSAGE_PAGE_SIZE;
      serverHistoryHasMoreByChannelRef.current[channelKey] = hasMore;
      setMessages((current) =>
        mergeMessagesChronologically(
          current,
          latestMessages,
          (message) => message.created_at || message.createdAt,
        ),
      );
      setReplyTarget(null);
      setPendingAttachments([]);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    } catch (error) {
      setMessageText(draftContent);
      setStatus(`Send failed: ${error.message}`);
    }
  }
  async function sendDm() {
    const draftContent = normalizeComposerDraft(dmText);
    const hasTextContent = draftContent.trim().length > 0;
    if (!activeDm || (!hasTextContent && pendingDmAttachments.length === 0))
      return;
    if (activeDm.isNoReply) {
      setStatus("The OpenCom official account is no-reply.");
      return;
    }

    const content = `${dmReplyTarget ? `> replying to ${dmReplyTarget.author}: ${dmReplyTarget.content}\n` : ""}${hasTextContent ? draftContent : ""}`;
    setDmText("");
    setShowEmotePicker(false);

    try {
      await api(`/v1/social/dms/${activeDm.id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          content: content || "Attachment",
          attachmentIds: pendingDmAttachments
            .map((attachment) => attachment.attachmentId || attachment.id)
            .filter(Boolean),
        }),
      });

      const path = buildPaginatedPath(
        `/v1/social/dms/${activeDm.id}/messages`,
        { limit: MESSAGE_PAGE_SIZE },
      );
      const data = await api(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const latestMessages = Array.isArray(data?.messages) ? data.messages : [];
      const hasMore =
        data?.hasMore != null
          ? !!data.hasMore
          : latestMessages.length >= MESSAGE_PAGE_SIZE;
      dmHistoryHasMoreByThreadRef.current[activeDm.id] = hasMore;
      setDms((current) =>
        current.map((item) => {
          if (item.id !== activeDm.id) return item;
          return {
            ...item,
            messages: mergeMessagesChronologically(
              item.messages || [],
              latestMessages,
              (message) => message.createdAt || message.created_at,
            ),
          };
        }),
      );
      setDmReplyTarget(null);
      setPendingDmAttachments([]);
      if (dmAttachmentInputRef.current) dmAttachmentInputRef.current.value = "";
    } catch (error) {
      setDmText(draftContent);
      setStatus(`DM send failed: ${error.message}`);
    }
  }

  async function addFriend() {
    const cleaned = friendAddInput.trim();
    if (!cleaned) return;

    try {
      const data = await api("/v1/social/friends", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ username: cleaned }),
      });

      if (data.friend && data.threadId) {
        setFriends((current) => [
          data.friend,
          ...current.filter((item) => item.id !== data.friend.id),
        ]);
        const nextDm = {
          id: data.threadId,
          participantId: data.friend.id,
          name: data.friend.username,
          messages: [],
        };
        setDms((current) => [
          nextDm,
          ...current.filter((item) => item.id !== nextDm.id),
        ]);
        setActiveDmId(nextDm.id);
        setStatus(`You're now connected with ${data.friend.username}.`);
      } else {
        setStatus("Friend request sent.");
      }

      const requests = await api("/v1/social/requests", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setFriendRequests({
        incoming: requests.incoming || [],
        outgoing: requests.outgoing || [],
      });
      setFriendAddInput("");
      setFriendView("requests");
    } catch (error) {
      setStatus(`Add friend failed: ${error.message}`);
    }
  }

  async function respondToFriendRequest(requestId, action) {
    try {
      await api(`/v1/social/requests/${requestId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const [requests, friendsData] = await Promise.all([
        api("/v1/social/requests", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        api("/v1/social/friends", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      setFriendRequests({
        incoming: requests.incoming || [],
        outgoing: requests.outgoing || [],
      });
      setFriends(friendsData.friends || []);
      if (action === "accept") setStatus("Friend request accepted.");
      else if (action === "cancel") setStatus("Friend request canceled.");
      else setStatus("Friend request declined.");
    } catch (error) {
      setStatus(`Request update failed: ${error.message}`);
    }
  }

  async function saveSocialSettings() {
    try {
      await api("/v1/social/settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ allowFriendRequests }),
      });
      setStatus("Privacy settings saved.");
    } catch (error) {
      setStatus(`Could not save privacy settings: ${error.message}`);
    }
  }

  async function loadSessions() {
    if (!accessToken) return;
    try {
      const data = await api("/v1/auth/sessions", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setSessions(data.sessions || []);
    } catch (error) {
      setStatus(`Could not load sessions: ${error.message}`);
    }
  }

  async function loadBoostStatus() {
    if (!accessToken) return null;
    setBoostLoading(true);
    try {
      const data = await api("/v1/billing/boost", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setBoostStatus(data);
      return data;
    } catch (error) {
      setStatus(`Could not load billing status: ${error.message}`);
      return null;
    } finally {
      setBoostLoading(false);
    }
  }

  async function loadGlobalEmoteCatalog({ quiet = false } = {}) {
    if (!accessToken) {
      setGlobalCustomEmoteCatalog([]);
      return [];
    }
    try {
      const data = await api("/v1/emotes/catalog", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const emotes = Array.isArray(data?.emotes) ? data.emotes : [];
      setGlobalCustomEmoteCatalog(emotes);
      return emotes;
    } catch (error) {
      if (!quiet) {
        setStatus(`Could not load global emotes: ${error.message}`);
      }
      return [];
    }
  }

  async function startBoostCheckout() {
    if (!accessToken) return;
    try {
      const data = await api("/v1/billing/boost/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      setStatus(`Could not start checkout: ${error.message}`);
    }
  }

  async function openBoostPortal() {
    if (!accessToken) return;
    try {
      const data = await api("/v1/billing/boost/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      setStatus(`Could not open billing portal: ${error.message}`);
    }
  }

  async function loadSentBoostGifts() {
    if (!accessToken) return;
    try {
      const data = await api("/v1/billing/boost/gifts", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setBoostGiftSent(data.gifts || []);
    } catch (error) {
      setStatus(`Could not load boost gifts: ${error.message}`);
    }
  }

  async function startBoostGiftCheckout() {
    if (!accessToken) return;
    setBoostGiftCheckoutBusy(true);
    try {
      const data = await api("/v1/billing/boost/gifts/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setStatus("Gift checkout URL missing.");
    } catch (error) {
      setStatus(`Could not start gift checkout: ${error.message}`);
    } finally {
      setBoostGiftCheckoutBusy(false);
    }
  }

  async function completeBoostGiftCheckout(giftId, sessionId) {
    if (!accessToken || !giftId || !sessionId) return;
    try {
      const data = await api("/v1/billing/boost/gifts/complete-purchase", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ giftId, sessionId }),
      });
      if (data?.giftCode) {
        setBoostGiftCode(data.giftCode);
      }
      await loadSentBoostGifts();
      setSettingsOpen(true);
      setSettingsTab("billing");
      setStatus("Boost gift purchased. Copy and send your gift link.");
    } catch (error) {
      setStatus(`Could not complete gift purchase: ${error.message}`);
    }
  }

  async function previewBoostGift(rawCode) {
    if (!accessToken) return;
    const code = parseBoostGiftCodeFromInput(rawCode);
    if (!code) {
      setStatus("Invalid boost gift code/link.");
      return;
    }
    setBoostGiftLoading(true);
    try {
      const data = await api(
        `/v1/billing/boost/gifts/${encodeURIComponent(code)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      setBoostGiftCode(code);
      setBoostGiftPreview(data);
      setBoostGiftPrompt(data);
      setSettingsOpen(true);
      setSettingsTab("billing");
      setStatus(
        `Boost gift from ${data?.from?.username || "someone"} is ready to redeem.`,
      );
    } catch (error) {
      setBoostGiftPreview(null);
      setBoostGiftPrompt(null);
      setStatus(`Could not load boost gift: ${error.message}`);
    } finally {
      setBoostGiftLoading(false);
    }
  }

  async function redeemBoostGift(codeInput = boostGiftCode) {
    if (!accessToken) return;
    const code = parseBoostGiftCodeFromInput(codeInput);
    if (!code) {
      setStatus("Invalid boost gift code.");
      return;
    }
    setBoostGiftRedeeming(true);
    try {
      const data = await api(
        `/v1/billing/boost/gifts/${encodeURIComponent(code)}/redeem`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      setBoostGiftPrompt(null);
      setBoostGiftPreview(null);
      await Promise.all([loadBoostStatus(), loadSentBoostGifts()]);
      setStatus(`Boost gift redeemed (${data?.grantDays || 30} days).`);
    } catch (error) {
      setStatus(`Could not redeem boost gift: ${error.message}`);
    } finally {
      setBoostGiftRedeeming(false);
    }
  }

  function showBoostUpsell(reason = "This action requires OpenCom Boost.") {
    setBoostUpsell({
      title: "Hold up",
      reason,
      cta: "Open Boost Settings",
    });
  }

  function openBoostUpsell(title, reason, cta) {
    setBoostUpsell({ title, reason, cta });
  }

  function openBoostSettingsFromUpsell() {
    setBoostUpsell(null);
    setSettingsOpen(true);
    setSettingsTab("billing");
    loadBoostStatus().catch(() => {});
    loadSentBoostGifts().catch(() => {});
  }

  async function revokeSession(sessionId) {
    if (!accessToken) return;
    try {
      await api(`/v1/auth/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setStatus("Session revoked.");
      await loadSessions();
    } catch (error) {
      setStatus(`Could not revoke session: ${error.message}`);
    }
  }

  async function changePassword() {
    if (
      !passwordForm.current ||
      !passwordForm.new ||
      passwordForm.new !== passwordForm.confirm
    ) {
      setStatus("Please fill all fields and ensure passwords match.");
      return;
    }
    if (passwordForm.new.length < 8) {
      setStatus("New password must be at least 8 characters.");
      return;
    }
    try {
      await api("/v1/auth/password", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          currentPassword: passwordForm.current,
          newPassword: passwordForm.new,
        }),
      });
      setPasswordForm({ current: "", new: "", confirm: "" });
      setStatus("Password changed successfully.");
    } catch (error) {
      setStatus(`Could not change password: ${error.message}`);
    }
  }

  function generateBase32Secret(length = 32) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let secret = "";
    for (let i = 0; i < length; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  function generateBackupCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      let code = "";
      for (let j = 0; j < 4; j++) {
        code += Math.floor(Math.random() * 10000)
          .toString()
          .padStart(4, "0");
        if (j < 3) code += "-";
      }
      codes.push(code);
    }
    return codes;
  }

  function initiate2FASetup() {
    const secret = generateBase32Secret(32);
    const codes = generateBackupCodes(8);

    setTwoFactorSecret(secret);
    setBackupCodes(codes);
    setShow2FASetup(true);
    setTwoFactorVerified(false);
    setTwoFactorToken("");

    const appName = "OpenCom";
    const accountName = me?.username || "user";
    const otpauthUrl = `otpauth://totp/${appName}:${accountName}?secret=${secret}&issuer=${appName}`;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
    setTwoFactorQRCode(qrCodeUrl);
    setStatus(
      "2FA setup initiated. Scan the QR code with your authenticator app.",
    );
  }

  function verifyTOTPToken(token, secret) {
    if (!token || !secret) return false;
    const cleanToken = token.replace(/\s/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(cleanToken)) return false;

    if (backupCodes.includes(cleanToken)) {
      setStatus("Backup code verified! Removing code from backups.");
      setBackupCodes((current) =>
        current.filter((code) => code !== cleanToken),
      );
      return true;
    }

    for (let offset = -1; offset <= 1; offset++) {
      const counter = Math.floor(Date.now() / 30000) + offset;
      if (calculateTOTP(secret, counter) === cleanToken) {
        return true;
      }
    }
    return false;
  }

  function calculateTOTP(secret, counter) {
    const secretBytes = base32Decode(secret);
    const counterBytes = new ArrayBuffer(8);
    const view = new DataView(counterBytes);
    view.setBigInt64(0, BigInt(counter), false);

    const hmacKey = secretBytes;
    return simpleHmacSha1(hmacKey, counterBytes);
  }

  function base32Decode(str) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (let i = 0; i < str.length; i++) {
      const idx = alphabet.indexOf(str[i]);
      if (idx < 0) continue;
      bits += idx.toString(2).padStart(5, "0");
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
    }
    return bytes;
  }

  function simpleHmacSha1(key, data) {
    const blockSize = 64;
    let k = new Uint8Array(blockSize);
    if (key.length > blockSize) {
      k = sha1Bytes(key);
      k = new Uint8Array(blockSize).map((_, i) => (i < k.length ? k[i] : 0));
    } else {
      k.set(key);
    }

    const oPad = new Uint8Array(blockSize);
    const iPad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      oPad[i] = k[i] ^ 0x5c;
      iPad[i] = k[i] ^ 0x36;
    }

    const iKeyPad = new Uint8Array(iPad.length + data.byteLength);
    iKeyPad.set(iPad);
    iKeyPad.set(new Uint8Array(data), iPad.length);

    const innerHash = sha1Bytes(iKeyPad.buffer);

    const oKeyPad = new Uint8Array(oPad.length + innerHash.length);
    oKeyPad.set(oPad);
    oKeyPad.set(innerHash, oPad.length);

    const hash = sha1Bytes(oKeyPad.buffer);
    const offset = hash[hash.length - 1] & 0x0f;
    const code =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    return (code % 1000000).toString().padStart(6, "0");
  }

  function sha1Bytes(data) {
    let view = new Uint8Array(data);
    const buf = Array.from(view)
      .map((x) => String.fromCharCode(x))
      .join("");
    const hash = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

    const len = buf.length * 8;
    let msg = buf.slice(0);
    msg += String.fromCharCode(0x80);
    while ((msg.length * 8) % 512 !== 448) msg += String.fromCharCode(0x00);

    for (let i = 7; i >= 0; i--) {
      msg += String.fromCharCode((len >>> (i * 8)) & 0xff);
    }

    for (let chunkStart = 0; chunkStart < msg.length; chunkStart += 64) {
      const w = Array(80);
      for (let i = 0; i < 16; i++) {
        w[i] =
          (msg.charCodeAt(chunkStart + i * 4) << 24) |
          (msg.charCodeAt(chunkStart + i * 4 + 1) << 16) |
          (msg.charCodeAt(chunkStart + i * 4 + 2) << 8) |
          msg.charCodeAt(chunkStart + i * 4 + 3);
      }

      for (let i = 16; i < 80; i++) {
        w[i] =
          ((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) << 1) |
          ((w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) >>> 31);
      }

      let [a, b, c, d, e] = hash;

      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) {
          f = (b & c) | (~b & d);
          k = 0x5a827999;
        } else if (i < 40) {
          f = b ^ c ^ d;
          k = 0x6ed9eba1;
        } else if (i < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8f1bbcdc;
        } else {
          f = b ^ c ^ d;
          k = 0xca62c1d6;
        }

        const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
        e = d;
        d = c;
        c = (b << 30) | (b >>> 2);
        b = a;
        a = temp;
      }

      hash[0] = (hash[0] + a) >>> 0;
      hash[1] = (hash[1] + b) >>> 0;
      hash[2] = (hash[2] + c) >>> 0;
      hash[3] = (hash[3] + d) >>> 0;
      hash[4] = (hash[4] + e) >>> 0;
    }

    const result = new Uint8Array(20);
    for (let i = 0; i < 5; i++) {
      result[i * 4] = (hash[i] >>> 24) & 0xff;
      result[i * 4 + 1] = (hash[i] >>> 16) & 0xff;
      result[i * 4 + 2] = (hash[i] >>> 8) & 0xff;
      result[i * 4 + 3] = hash[i] & 0xff;
    }
    return result;
  }

  function confirm2FA() {
    if (!verifyTOTPToken(twoFactorToken, twoFactorSecret)) {
      setStatus("Invalid token. Please check your authenticator app.");
      return;
    }

    setSecuritySettings((current) => ({ ...current, twoFactorEnabled: true }));
    setTwoFactorVerified(true);
    setStatus("2FA enabled successfully! Your backup codes have been saved.");
    setShow2FASetup(false);
  }

  async function disable2FA() {
    const approved = await confirmDialog(
      "Are you sure? You will lose 2FA protection.",
      "Disable 2FA",
    );
    if (!approved) return;
    setSecuritySettings((current) => ({ ...current, twoFactorEnabled: false }));
    setTwoFactorSecret("");
    setBackupCodes([]);
    setTwoFactorVerified(false);
    setShow2FASetup(false);
    setStatus("2FA has been disabled.");
  }

  async function openDmFromFriend(friend) {
    const existing = dms.find(
      (item) =>
        item.participantId === friend.id || item.name === friend.username,
    );
    if (existing) {
      setActiveDmId(existing.id);
      setNavMode("dms");
      return existing.id;
    }

    try {
      const data = await api("/v1/social/dms/open", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ friendId: friend.id }),
      });

      const threadId = data.threadId;
      setDms((current) => {
        const existing = current.find((item) => item.id === threadId);
        if (existing) return current;
        return [
          {
            id: threadId,
            participantId: friend.id,
            name: friend.username,
            messages: [],
          },
          ...current,
        ];
      });
      setActiveDmId(threadId);
      setNavMode("dms");
      return threadId;
    } catch (error) {
      setStatus(`Open DM failed: ${error.message}`);
      return "";
    }
  }

  async function saveProfile() {
    try {
      const normalizedUsername = String(profileForm.username || "").trim();
      if (normalizedUsername.length < 2 || normalizedUsername.length > 32) {
        setStatus("Username must be between 2 and 32 characters.");
        return;
      }
      await api("/v1/me/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          username: normalizedUsername,
          displayName: profileForm.displayName || null,
          bio: profileForm.bio || null,
          pfpUrl: normalizeImageUrlInput(profileForm.pfpUrl) || null,
          bannerUrl: normalizeImageUrlInput(profileForm.bannerUrl) || null,
          notificationSoundUrl:
            normalizeImageUrlInput(profileForm.notificationSoundUrl) || null,
        }),
      });
      if (me?.id) {
        const updated = await api("/v1/me/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setProfile(updated);
        setMe((current) =>
          current
            ? {
                ...current,
                username: updated.username ?? current.username,
              }
            : current,
        );
        setFullProfileDraft(normalizeFullProfile(updated, updated.fullProfile));
        setProfileForm({
          username: updated.username ?? normalizedUsername,
          displayName: updated.displayName ?? "",
          bio: updated.bio ?? "",
          pfpUrl: updated.pfpUrl ?? "",
          bannerUrl: updated.bannerUrl ?? "",
          notificationSoundUrl: updated.notificationSoundUrl ?? "",
        });
      } else {
        setProfile((current) => ({ ...current, ...profileForm }));
      }
      setStatus("Profile updated.");
    } catch (error) {
      const msg = error?.message || "";
      if (
        msg.includes("INVALID_IMAGE") ||
        msg.includes("Invalid image format")
      ) {
        setStatus(
          "Invalid image URL. Use uploaded image paths (/v1/profile-images/...), users/... paths, or valid http(s) image URLs.",
        );
      } else if (
        msg.includes("INVALID_NOTIFICATION_SOUND") ||
        msg.toLowerCase().includes("notification sound")
      ) {
        setStatus(
          "Invalid notification sound URL. Use an uploaded audio path (/v1/profile-images/...), users/... paths, or a valid http(s) audio URL.",
        );
      } else if (msg.includes("USERNAME_TAKEN")) {
        setStatus("That username is already taken.");
      } else if (msg.includes("USERNAME_RESERVED")) {
        setStatus("That username is reserved.");
      } else setStatus(`Profile update failed: ${msg}`);
    }
  }

  function testNotificationSound() {
    playNotificationBeep({
      mute: false,
      soundUrl: resolveNotificationSoundUrl(
        profileForm.notificationSoundUrl || profile?.notificationSoundUrl || "",
      ),
    });
  }

  function updateFullProfileElement(elementId, patch) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      elements: (current.elements || []).map((item) => {
        if (item.id !== elementId) return item;
        const merged = { ...item, ...patch };
        const rect = clampProfileElementRect(
          { x: merged.x, y: merged.y, w: merged.w, h: merged.h },
          item,
        );
        return { ...merged, ...rect };
      }),
    }));
  }

  function addFullProfileElement(elementType) {
    const type = String(elementType || "").toLowerCase();
    if (
      !["avatar", "banner", "name", "bio", "links", "text", "music"].includes(
        type,
      )
    )
      return;
    const nextId = `${type}-${Date.now()}`;
    const fallback =
      type === "banner"
        ? { x: 0, y: 0, w: 100, h: 34 }
        : type === "avatar"
          ? { x: 4, y: 21, w: 20, h: 31 }
          : type === "name"
            ? { x: 30, y: 30, w: 66, h: 10 }
            : type === "bio"
              ? { x: 4, y: 54, w: 92, h: 22 }
              : type === "links"
                ? { x: 4, y: 76, w: 56, h: 20 }
                : type === "music"
                  ? { x: 74, y: 6, w: 22, h: 9 }
                  : { x: 8, y: 22, w: 58, h: 12 };
    setFullProfileDraft((current) => {
      const nextIndex = (current.elements || []).length + 1;
      const placement = clampProfileElementRect(
        {
          x: Number(fallback.x || 0) + ((nextIndex - 1) % 5) * 3,
          y: Number(fallback.y || 0) + ((nextIndex - 1) % 5) * 3,
          w: fallback.w,
          h: fallback.h,
        },
        fallback,
      );
      return {
        ...current,
        mode: "custom",
        enabled: true,
        elements: [
          ...(current.elements || []),
          {
            id: nextId,
            type,
            ...placement,
            order: 10 + nextIndex,
            text: type === "text" ? `Custom text ${nextIndex}` : "",
            radius: type === "avatar" ? 18 : type === "banner" ? 0 : 8,
            opacity: 100,
            fontSize:
              type === "name"
                ? 22
                : type === "bio"
                  ? 14
                  : type === "links"
                    ? 14
                    : type === "music"
                      ? 12
                      : 16,
            align: "left",
            color: "",
          },
        ],
      };
    });
    setProfileStudioSelectedElementId(nextId);
  }

  function addFullProfileTextBlock() {
    addFullProfileElement("text");
  }

  function removeFullProfileElement(elementId) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      elements: (current.elements || []).filter(
        (item) => item.id !== elementId,
      ),
    }));
    if (profileStudioSelectedElementId === elementId)
      setProfileStudioSelectedElementId("");
  }

  function addFullProfileLink() {
    setFullProfileDraft((current) => {
      const nextIndex = (current.links || []).length + 1;
      return {
        ...current,
        mode: "custom",
        links: [
          ...(current.links || []),
          {
            id: `link-${Date.now()}`,
            label: `Link ${nextIndex}`,
            url: "https://",
            x: 0,
            y: 0,
          },
        ].slice(0, 16),
      };
    });
  }

  function updateFullProfileLink(linkId, patch) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      links: (current.links || []).map((item) =>
        item.id === linkId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function removeFullProfileLink(linkId) {
    setFullProfileDraft((current) => ({
      ...current,
      mode: "custom",
      links: (current.links || []).filter((item) => item.id !== linkId),
    }));
  }

  function resetFullProfileDraftToBasic() {
    setFullProfileDraft(createBasicFullProfile(profile || {}));
    setProfileStudioSelectedElementId("");
  }

  function nudgeFullProfileElement(elementId, patch) {
    const element = (fullProfileDraft?.elements || []).find(
      (item) => item.id === elementId,
    );
    if (!element) return;
    const rect = clampProfileElementRect(
      {
        x: patch.x ?? element.x,
        y: patch.y ?? element.y,
        w: patch.w ?? element.w,
        h: patch.h ?? element.h,
      },
      element,
    );
    updateFullProfileElement(elementId, {
      ...rect,
      order: Math.max(
        0,
        Math.min(
          100,
          Number.isFinite(Number(patch.order))
            ? Number(patch.order)
            : Number(element.order || 0),
        ),
      ),
    });
  }

  async function saveFullProfileDraft() {
    if (!hasBoostForFullProfiles) {
      openBoostUpsell(
        "Boost required",
        "Custom full profiles are a Boost perk. Without Boost you get the default profile layout.",
        "Open billing",
      );
      return;
    }
    try {
      const payload = normalizeFullProfile(profile || {}, {
        ...fullProfileDraft,
        mode: "custom",
        enabled: true,
      });
      const data = await api("/v1/me/profile/full", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      });
      const nextProfile = {
        ...(profile || {}),
        fullProfile: normalizeFullProfile(
          profile || {},
          data?.fullProfile || payload,
        ),
        hasCustomFullProfile: true,
      };
      setProfile(nextProfile);
      setFullProfileDraft(nextProfile.fullProfile);
      setStatus("Full profile updated.");
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("BOOST_REQUIRED")) {
        openBoostUpsell(
          "Boost required",
          "Custom full profiles are a Boost perk. Activate Boost to save your layout.",
          "Open billing",
        );
      } else {
        setStatus(`Full profile update failed: ${message}`);
      }
    }
  }

  function onFullProfileElementMouseDown(event, elementId) {
    if (!fullProfileEditorCanvasRef.current) return;
    const element = (fullProfileDraft.elements || []).find(
      (item) => item.id === elementId,
    );
    if (!element) return;
    const rect = fullProfileEditorCanvasRef.current.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 100;
    const py = ((event.clientY - rect.top) / rect.height) * 100;
    fullProfileDragOffsetRef.current = {
      x: px - Number(element.x || 0),
      y: py - Number(element.y || 0),
    };
    setProfileStudioSelectedElementId(elementId);
    setFullProfileDraggingElementId(elementId);
  }

  async function saveRichPresence() {
    if (!accessToken) return;
    const activity = rpcActivityFromForm(rpcForm);
    if (
      !activity.name &&
      !activity.details &&
      !activity.state &&
      !activity.largeImageUrl &&
      !activity.smallImageUrl &&
      !activity.buttons
    ) {
      setStatus("Add at least one rich presence field before saving.");
      return;
    }
    try {
      await api("/v1/presence/rpc", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ activity }),
      });
      if (me?.id) {
        setPresenceByUserId((prev) => ({
          ...prev,
          [me.id]: {
            ...(prev[me.id] || {}),
            status: prev[me.id]?.status || selfStatus,
            customStatus: prev[me.id]?.customStatus ?? null,
            richPresence: activity,
          },
        }));
      }
      setStatus("Rich presence updated.");
    } catch (error) {
      setStatus(
        `Rich presence update failed: ${describeApiError(error, "Check your image URLs, button links, and text length.")}`,
      );
    }
  }

  async function clearRichPresence() {
    if (!accessToken) return;
    try {
      await api("/v1/presence/rpc", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (me?.id) {
        setPresenceByUserId((prev) => ({
          ...prev,
          [me.id]: {
            ...(prev[me.id] || {}),
            status: prev[me.id]?.status || selfStatus,
            customStatus: prev[me.id]?.customStatus ?? null,
            richPresence: null,
          },
        }));
      }
      setRpcForm(rpcFormFromActivity(null));
      setStatus("Rich presence cleared.");
    } catch (error) {
      setStatus(`Clear rich presence failed: ${error.message}`);
    }
  }

  async function saveActiveServerProfile() {
    if (!activeServer || !canManageServer) return;
    try {
      await api(`/v1/servers/${activeServer.id}/profile`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: serverProfileForm.name?.trim() || undefined,
          logoUrl:
            normalizeImageUrlInput(serverProfileForm.logoUrl || "") || null,
          bannerUrl:
            normalizeImageUrlInput(serverProfileForm.bannerUrl || "") || null,
        }),
      });
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
      setServers(next);
      setStatus("Server profile updated.");
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("LOGO_REQUIRED")) setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL"))
        setStatus(
          "Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("INVALID_BANNER_URL"))
        setStatus(
          "Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("VALIDATION_ERROR"))
        setStatus(
          "Server profile data is invalid. Check name, logo URL, and banner URL.",
        );
      else setStatus(`Server profile update failed: ${msg}`);
    }
  }

  async function toggleActiveServerGlobalEmotes(enabled) {
    if (!activeServer || !accessToken) return;
    if (!(activeServer.roles || []).includes("owner")) {
      setStatus("Only the server owner can change global emote access.");
      return;
    }

    if (enabled) {
      const entitlement = boostStatus || (await loadBoostStatus());
      if (!entitlement?.active) {
        showBoostUpsell(
          "Global custom emotes require OpenCom Boost on the server owner.",
        );
        return;
      }
    }

    try {
      await api(`/v1/servers/${activeServer.id}/global-emotes`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ enabled }),
      });
      setServers((current) =>
        current.map((server) =>
          server.id === activeServer.id
            ? { ...server, globalEmotesEnabled: !!enabled }
            : server,
        ),
      );
      await loadGlobalEmoteCatalog({ quiet: true });
      setStatus(
        enabled
          ? "Members can now use this server's custom emotes globally."
          : "Global custom emotes disabled for this server.",
      );
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("BOOST_REQUIRED")) {
        showBoostUpsell(
          "Global custom emotes require OpenCom Boost on the server owner.",
        );
        return;
      }
      setStatus(`Global emote update failed: ${message}`);
    }
  }

  async function createServer() {
    if (
      !newServerName.trim() ||
      !newServerBaseUrl.trim() ||
      !newServerLogoUrl.trim()
    )
      return;
    try {
      await api("/v1/servers", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: newServerName.trim(),
          baseUrl: newServerBaseUrl.trim(),
          logoUrl: normalizeImageUrlInput(newServerLogoUrl),
          bannerUrl: normalizeImageUrlInput(newServerBannerUrl) || null,
        }),
      });
      setNewServerName("");
      setNewServerBaseUrl("https://");
      setNewServerLogoUrl("");
      setNewServerBannerUrl("");
      setStatus("Server provider added.");
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setServers(normalizeServerList(refreshed.servers || []));
      setAddServerModalOpen(false);
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("LOGO_REQUIRED")) setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL"))
        setStatus(
          "Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("INVALID_BANNER_URL"))
        setStatus(
          "Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else setStatus(`Add server failed: ${msg}`);
    }
  }

  function updateActiveServerVoiceGatewayPref(patch) {
    if (!activeServerId) return;
    setServerVoiceGatewayPrefs((current) => {
      const prev = current[activeServerId] || { mode: "core", customUrl: "" };
      const next = { ...prev, ...patch };
      return { ...current, [activeServerId]: next };
    });
  }

  async function createInvite() {
    if (!inviteServerId) return;
    const wantsBoostPerk =
      invitePermanent || inviteCustomCode.trim().length > 0;
    if (wantsBoostPerk && boostStatus && !boostStatus.active) {
      showBoostUpsell(
        "Custom invite codes and permanent invite links require OpenCom Boost.",
      );
      return;
    }
    try {
      const payload = {
        serverId: inviteServerId,
        code: inviteCustomCode.trim() || undefined,
        permanent: invitePermanent,
      };
      const data = await api("/v1/invites", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      });
      setInviteCode(data.code);
      setInviteJoinUrl(data.joinUrl || "");
      setInviteCustomCode("");
      setStatus("Invite code generated.");
    } catch (error) {
      if (String(error?.message || "").includes("BOOST_REQUIRED")) {
        showBoostUpsell(
          "Custom invite codes and permanent invite links require OpenCom Boost.",
        );
        return;
      }
      setStatus(`Invite failed: ${error.message}`);
    }
  }

  async function previewInvite(value = null) {
    const code = parseInviteCodeFromInput(value ?? joinInviteCode ?? "");
    if (!code) {
      setInvitePreview(null);
      setStatus("Invalid invite code/link.");
      return;
    }
    try {
      const data = await api(`/v1/invites/${code}`);
      setInvitePreview(data);
      setJoinInviteCode(code);
      setInvitePendingCode(code);
      setStatus("Invite preview loaded.");
    } catch (error) {
      setInvitePreview(null);
      setStatus(`Invite lookup failed: ${error.message}`);
    }
  }

  async function joinInvite(codeToUse = null) {
    const code = parseInviteCodeFromInput(codeToUse || joinInviteCode || "");
    if (!code) return;

    try {
      const data = await api(`/v1/invites/${code}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ accept: true }),
      });
      setJoinInviteCode("");
      setInvitePreview(null);
      setInvitePendingCode("");
      setInvitePendingAutoJoin(false);
      const joinedServerName =
        data?.serverName ||
        data?.server?.name ||
        invitePreview?.serverName ||
        "";
      setStatus(
        joinedServerName
          ? `Joined ${joinedServerName}.`
          : "Joined server from invite.",
      );

      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
      setServers(next);
      const joinedServerId = data?.serverId;
      if (joinedServerId && next.some((s) => s.id === joinedServerId)) {
        setActiveServerId(joinedServerId);
      } else if (next.length) {
        setActiveServerId(next[0].id);
      }
      setAddServerModalOpen(false);
    } catch (error) {
      setStatus(`Join failed: ${error.message}`);
    }
  }

  const VIEW_CHANNEL_BIT = 1;
  const SEND_MESSAGES_BIT = 2;

  function parseRoleInputToIds(raw = "") {
    const tokens = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!tokens.length) return [];
    const rolePool = (guildState?.roles || []).filter(
      (role) => !role.is_everyone,
    );
    const byId = new Map(
      rolePool.map((role) => [String(role.id).toLowerCase(), role.id]),
    );
    const byName = new Map(
      rolePool.map((role) => [String(role.name || "").toLowerCase(), role.id]),
    );
    const picked = [];
    for (const token of tokens) {
      const key = token.toLowerCase();
      const roleId = byId.get(key) || byName.get(key);
      if (roleId && !picked.includes(roleId)) picked.push(roleId);
    }
    return picked;
  }

  async function applyPrivateVisibilityToChannel(
    channelId,
    allowedRoleIds = [],
    server = activeServer,
    guildId = workingGuildId,
  ) {
    if (!server || !guildId || !channelId) return;
    const everyoneRole = (guildState?.roles || []).find(
      (role) => role.is_everyone,
    );
    if (!everyoneRole) throw new Error("EVERYONE_ROLE_NOT_FOUND");

    await nodeApi(
      server.baseUrl,
      `/v1/channels/${channelId}/overwrites`,
      server.membershipToken,
      {
        method: "PUT",
        body: JSON.stringify({
          targetType: "role",
          targetId: everyoneRole.id,
          allow: "0",
          deny: String(VIEW_CHANNEL_BIT),
        }),
      },
    );

    for (const roleId of allowedRoleIds) {
      await nodeApi(
        server.baseUrl,
        `/v1/channels/${channelId}/overwrites`,
        server.membershipToken,
        {
          method: "PUT",
          body: JSON.stringify({
            targetType: "role",
            targetId: roleId,
            allow: String(VIEW_CHANNEL_BIT),
            deny: "0",
          }),
        },
      );
    }
  }

  async function createChannelWithOptions({
    server = activeServer,
    guildId = workingGuildId,
    name,
    type = "text",
    parentId = "",
    privateRoleIds = null,
  }) {
    if (!server || !guildId || !name?.trim()) return null;

    const payload = { name: name.trim(), type };
    if (type !== "category" && parentId) payload.parentId = parentId;

    const created = await nodeApi(
      server.baseUrl,
      `/v1/guilds/${guildId}/channels`,
      server.membershipToken,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const channelId = created?.channelId;
    if (channelId && Array.isArray(privateRoleIds)) {
      await applyPrivateVisibilityToChannel(
        channelId,
        privateRoleIds,
        server,
        guildId,
      );
    }

    if (server.id === activeServerId && guildId === workingGuildId) {
      const state = await nodeApi(
        server.baseUrl,
        `/v1/guilds/${guildId}/state`,
        server.membershipToken,
      );
      setGuildState(state);
    }

    return channelId;
  }

  async function promptCreateChannelFlow({
    server = activeServer,
    guildId = workingGuildId,
    fixedType = "",
    fixedParentId = "",
  } = {}) {
    if (!server || !guildId) {
      setStatus(
        "No active guild selected yet. Open a channel first, then try again.",
      );
      return;
    }

    const type =
      fixedType ||
      (
        (await promptText("Channel type: text, voice, or category", "text")) ||
        ""
      )
        .trim()
        .toLowerCase();
    if (!["text", "voice", "category"].includes(type)) {
      setStatus("Invalid channel type.");
      return;
    }

    const suggestedName = type === "category" ? "New Category" : `new-${type}`;
    const name = (
      (await promptText(`Name for the new ${type}:`, suggestedName)) || ""
    ).trim();
    if (!name) return;

    let parentId = fixedParentId || "";
    if (type !== "category" && !fixedParentId) {
      const parentName = (
        (await promptText(
          "Optional category name/ID (leave blank for none):",
          "",
        )) || ""
      ).trim();
      if (parentName) {
        const parent = (categoryChannels || []).find(
          (cat) =>
            cat.id === parentName ||
            String(cat.name || "").toLowerCase() === parentName.toLowerCase(),
        );
        if (!parent) {
          setStatus("Category not found.");
          return;
        }
        parentId = parent.id;
      }
    }

    let privateRoleIds = null;
    if (type === "category") {
      const makePrivate = await confirmDialog(
        "Make this category private?",
        "Category Privacy",
      );
      if (makePrivate) {
        const roleList = (guildState?.roles || [])
          .filter((role) => !role.is_everyone)
          .map((role) => role.name)
          .join(", ");
        const rawRoles =
          (await promptText(
            `Allowed roles (comma-separated names or IDs).\nAvailable: ${roleList}`,
            "",
          )) || "";
        privateRoleIds = parseRoleInputToIds(rawRoles);
      }
    }

    try {
      await createChannelWithOptions({
        server,
        guildId,
        name,
        type,
        parentId,
        privateRoleIds,
      });
      setStatus(`${type === "category" ? "Category" : "Channel"} created.`);
    } catch (error) {
      setStatus(`Create channel failed: ${error.message}`);
    }
  }

  async function createChannel() {
    if (!activeServer || !workingGuildId || !newChannelName.trim()) return;
    try {
      await createChannelWithOptions({
        server: activeServer,
        guildId: workingGuildId,
        name: newChannelName,
        type: newChannelType,
        parentId: newChannelType !== "category" ? newChannelParentId : "",
      });
      setNewChannelName("");
      setNewChannelParentId("");
      setStatus("Channel created.");
    } catch (error) {
      setStatus(`Create channel failed: ${error.message}`);
    }
  }

  async function createServerEmote() {
    if (
      !activeServer ||
      !activeGuildId ||
      !newServerEmoteName.trim() ||
      !newServerEmoteUrl.trim()
    )
      return;
    const normalizedImageUrl = normalizeImageUrlInput(newServerEmoteUrl);
    if (!normalizedImageUrl) {
      setStatus("Enter a valid emote image URL first.");
      return;
    }
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/emotes`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: newServerEmoteName.trim().toLowerCase(),
            imageUrl: normalizedImageUrl,
          }),
        },
      );
      setNewServerEmoteName("");
      setNewServerEmoteUrl("");
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      await loadGlobalEmoteCatalog({ quiet: true });
      setStatus("Custom emote created.");
    } catch (error) {
      setStatus(`Create emote failed: ${error.message}`);
    }
  }

  async function removeServerEmote(emoteId) {
    if (!activeServer || !activeGuildId || !emoteId) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/emotes/${emoteId}`,
        activeServer.membershipToken,
        {
          method: "DELETE",
        },
      );
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      await loadGlobalEmoteCatalog({ quiet: true });
      setStatus("Custom emote removed.");
    } catch (error) {
      setStatus(`Remove emote failed: ${error.message}`);
    }
  }

  async function updateChannelPosition(channelId, newPosition) {
    if (!activeServer || !activeGuildId) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}`,
        activeServer.membershipToken,
        {
          method: "PATCH",
          body: JSON.stringify({ position: newPosition }),
        },
      );
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
    } catch (e) {
      setStatus(`Move channel failed: ${e.message}`);
    }
  }

  async function handleChannelDrop(draggedId, targetId, sectionItems) {
    const fromIndex = sectionItems.findIndex((c) => c.id === draggedId);
    const toIndex = sectionItems.findIndex((c) => c.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const reordered = [...sectionItems];
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);
    const channels = guildState?.channels || [];
    const byParent = new Map();
    for (const c of channels) {
      const pid = c.parent_id || "__uncat__";
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(c);
    }
    const sectionParentId = sectionItems[0]?.parent_id ?? "__uncat__";
    const flatOrder = [];
    const sortedParents = [...byParent.keys()].sort((a, b) => {
      const listA = byParent.get(a);
      const listB = byParent.get(b);
      const posA = Math.min(...listA.map((c) => c.position ?? 0));
      const posB = Math.min(...listB.map((c) => c.position ?? 0));
      return posA - posB;
    });
    for (const pid of sortedParents) {
      const list = byParent.get(pid);
      const isThisSection = pid === sectionParentId;
      const ordered = isThisSection
        ? reordered
        : list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      flatOrder.push(...ordered);
    }
    const updates = flatOrder.map((ch, idx) =>
      (ch.position ?? -1) !== idx
        ? updateChannelPosition(ch.id, idx)
        : Promise.resolve(),
    );
    await Promise.all(updates);
    setChannelDragId(null);
  }

  async function handleCategoryDrop(draggedId, targetId) {
    const categories = [...(categoryChannels || [])];
    const fromIndex = categories.findIndex((c) => c.id === draggedId);
    const toIndex = categories.findIndex((c) => c.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const reordered = [...categories];
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);
    try {
      await Promise.all(
        reordered.map((cat, idx) => updateChannelPosition(cat.id, idx * 100)),
      );
      setCategoryDragId(null);
    } catch (e) {
      setStatus(`Move category failed: ${e.message}`);
    }
  }

  async function setChannelRoleSend(channelId, roleId, canSend) {
    if (!activeServer || !channelId || !roleId) return;
    try {
      const everyoneRole = (guildState?.roles || []).find((r) => r.is_everyone);
      if (canSend) {
        if (everyoneRole) {
          await nodeApi(
            activeServer.baseUrl,
            `/v1/channels/${channelId}/overwrites`,
            activeServer.membershipToken,
            {
              method: "PUT",
              body: JSON.stringify({
                targetType: "role",
                targetId: everyoneRole.id,
                allow: "0",
                deny: String(SEND_MESSAGES_BIT),
              }),
            },
          );
        }
        await nodeApi(
          activeServer.baseUrl,
          `/v1/channels/${channelId}/overwrites`,
          activeServer.membershipToken,
          {
            method: "PUT",
            body: JSON.stringify({
              targetType: "role",
              targetId: roleId,
              allow: String(SEND_MESSAGES_BIT),
              deny: "0",
            }),
          },
        );
      } else {
        await nodeApi(
          activeServer.baseUrl,
          `/v1/channels/${channelId}/overwrites`,
          activeServer.membershipToken,
          {
            method: "DELETE",
            body: JSON.stringify({ targetType: "role", targetId: roleId }),
          },
        );
        const otherRoleAllows = (guildState?.overwrites || []).filter(
          (o) =>
            o.channel_id === channelId &&
            o.target_type === "role" &&
            o.target_id !== roleId &&
            parseInt(o.allow, 10) & SEND_MESSAGES_BIT,
        );
        if (everyoneRole && otherRoleAllows.length === 0) {
          await nodeApi(
            activeServer.baseUrl,
            `/v1/channels/${channelId}/overwrites`,
            activeServer.membershipToken,
            {
              method: "DELETE",
              body: JSON.stringify({
                targetType: "role",
                targetId: everyoneRole.id,
              }),
            },
          );
        }
      }
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
    } catch (e) {
      setStatus(`Permission update failed: ${e.message}`);
    }
  }

  function channelOverwriteAllowsSend(channelId, roleId) {
    const ov = (guildState?.overwrites || []).find(
      (o) =>
        o.channel_id === channelId &&
        o.target_type === "role" &&
        o.target_id === roleId,
    );
    if (!ov) return false;
    return (parseInt(ov.allow, 10) & SEND_MESSAGES_BIT) !== 0;
  }

  async function createRole() {
    if (!activeServer || !activeGuildId || !newRoleName.trim()) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/roles`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify({ name: newRoleName.trim(), permissions: "0" }),
        },
      );
      setNewRoleName("");
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      setStatus("Role created.");
    } catch (error) {
      setStatus(`Create role failed: ${error.message}`);
    }
  }

  async function assignRoleToMember() {
    if (!activeServer || !activeGuildId || !selectedMemberId || !selectedRoleId)
      return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/members/${selectedMemberId}/roles/${selectedRoleId}`,
        activeServer.membershipToken,
        { method: "PUT", body: "{}" },
      );
      setStatus("Role assigned.");
    } catch (error) {
      setStatus(`Assign role failed: ${error.message}`);
    }
  }

  async function refreshActiveGuildState() {
    if (!activeServer || !activeGuildId) return;
    const state = await nodeApi(
      activeServer.baseUrl,
      `/v1/guilds/${activeGuildId}/state`,
      activeServer.membershipToken,
    );
    setGuildState(state);
  }

  async function kickMember(memberId) {
    if (
      !activeServer ||
      !activeGuildId ||
      !memberId ||
      !canKickMembers ||
      moderationBusy
    )
      return;
    const member = resolvedMemberList.find((item) => item.id === memberId);
    const label = member?.username || memberId;
    if (
      !(await confirmDialog(
        `Kick ${label}? They can rejoin with an invite.`,
        "Kick Member",
      ))
    )
      return;

    setModerationBusy(true);
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/members/${memberId}/kick`,
        activeServer.membershipToken,
        { method: "POST", body: "{}" },
      );
      await refreshActiveGuildState();
      if (memberProfileCard?.id === memberId) setMemberProfileCard(null);
      setStatus(`Kicked ${label}.`);
    } catch (error) {
      setStatus(`Kick failed: ${error.message}`);
    } finally {
      setModerationBusy(false);
    }
  }

  async function banMember(memberId, reason = "") {
    if (
      !activeServer ||
      !activeGuildId ||
      !memberId ||
      !canBanMembers ||
      moderationBusy
    )
      return;
    const member = resolvedMemberList.find((item) => item.id === memberId);
    const label = member?.username || memberId;
    if (
      !(await confirmDialog(
        `Ban ${label}? This removes them and blocks rejoin until unbanned.`,
        "Ban Member",
      ))
    )
      return;

    setModerationBusy(true);
    try {
      const payload = {};
      if (reason.trim()) payload.reason = reason.trim().slice(0, 256);
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/members/${memberId}/ban`,
        activeServer.membershipToken,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      await refreshActiveGuildState();
      if (memberProfileCard?.id === memberId) setMemberProfileCard(null);
      setStatus(`Banned ${label}.`);
    } catch (error) {
      setStatus(`Ban failed: ${error.message}`);
    } finally {
      setModerationBusy(false);
    }
  }

  async function unbanMember(memberId) {
    if (
      !activeServer ||
      !activeGuildId ||
      !memberId ||
      !canBanMembers ||
      moderationBusy
    )
      return;
    setModerationBusy(true);
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/bans/${memberId}`,
        activeServer.membershipToken,
        { method: "DELETE" },
      );
      setStatus(`Unbanned ${memberId}.`);
      setModerationUnbanUserId("");
    } catch (error) {
      setStatus(`Unban failed: ${error.message}`);
    } finally {
      setModerationBusy(false);
    }
  }

  async function updateRole(roleId, { color, position }) {
    if (!activeServer || !roleId) return;
    try {
      const body = {};
      if (color !== undefined)
        body.color =
          typeof color === "string" && color.startsWith("#")
            ? parseInt(color.slice(1), 16)
            : color;
      if (position !== undefined) body.position = position;
      if (Object.keys(body).length === 0) return;
      await nodeApi(
        activeServer.baseUrl,
        `/v1/roles/${roleId}`,
        activeServer.membershipToken,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${activeGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      setStatus("Role updated.");
    } catch (error) {
      setStatus(`Update role failed: ${error.message}`);
    }
  }

  function startDraggingProfileCard(event) {
    if (typeof event.button === "number" && event.button !== 0) return;
    event.preventDefault();
    profileCardDragPointerIdRef.current = Number.isFinite(
      Number(event.pointerId),
    )
      ? event.pointerId
      : null;
    profileCardDragOffsetRef.current = invertProfileDrag
      ? {
          x: event.clientX + profileCardPosition.x,
          y: event.clientY + profileCardPosition.y,
        }
      : {
          x: event.clientX - profileCardPosition.x,
          y: event.clientY - profileCardPosition.y,
        };
    setDraggingProfileCard(true);
  }

  function toggleCategory(categoryId) {
    setCollapsedCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  }

  function openServerContextMenu(event, server) {
    event.preventDefault();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 260,
      height: 260,
    });
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setServerContextMenu({ server, x: pos.x, y: pos.y });
  }

  function openChannelContextMenu(event, channel) {
    event.preventDefault();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 260,
      height: 230,
    });
    setServerContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setCategoryContextMenu(null);
    setChannelContextMenu({ channel, x: pos.x, y: pos.y });
  }

  function openCategoryContextMenu(event, category) {
    event.preventDefault();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 260,
      height: 230,
    });
    setServerContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu({ category, x: pos.x, y: pos.y });
  }

  async function saveChannelName(channelId, currentName) {
    if (!activeServer || !workingGuildId) return;
    const nextName = (
      (await promptText("Channel name:", currentName || "")) || ""
    ).trim();
    if (!nextName || nextName === currentName) return;
    await nodeApi(
      activeServer.baseUrl,
      `/v1/channels/${channelId}`,
      activeServer.membershipToken,
      {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      },
    );
  }

  async function setChannelVisibilityByRoles(channelId) {
    if (!activeServer || !workingGuildId || !channelId) return;
    const roleList = (guildState?.roles || [])
      .filter((role) => !role.is_everyone)
      .map((role) => role.name)
      .join(", ");
    const rawRoles = await promptText(
      `Visible to roles (comma-separated names or IDs). Leave blank to keep private for admins only.\nAvailable: ${roleList}`,
      "",
    );
    if (rawRoles == null) return;
    const allowedRoleIds = parseRoleInputToIds(rawRoles);
    await applyPrivateVisibilityToChannel(
      channelId,
      allowedRoleIds,
      activeServer,
      workingGuildId,
    );
  }

  async function openChannelSettings(channel) {
    if (!channel || !canManageServer || !activeServer || !workingGuildId) {
      return;
    }
    openServerAdmin(activeServer.id, {
      tab: "channels",
      guildId: workingGuildId,
      channelId: channel.id,
      channelAction: "edit",
    });
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
  }

  async function deleteChannelById(channel) {
    if (!channel || !canManageServer || !activeServer || !workingGuildId)
      return;
    const kind = channel.type === "category" ? "category" : "channel";
    if (
      !(await confirmDialog(
        `Delete ${kind} "${channel.name}"?`,
        "Delete Channel",
      ))
    )
      return;

    try {
      if (channel.type === "category") {
        const children = (guildState?.channels || []).filter(
          (item) => item.parent_id === channel.id,
        );
        for (const child of children) {
          await nodeApi(
            activeServer.baseUrl,
            `/v1/channels/${child.id}`,
            activeServer.membershipToken,
            {
              method: "PATCH",
              body: JSON.stringify({ parentId: null }),
            },
          );
        }
      }

      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channel.id}`,
        activeServer.membershipToken,
        {
          method: "DELETE",
        },
      );

      if (activeChannelId === channel.id) setActiveChannelId("");
      const state = await nodeApi(
        activeServer.baseUrl,
        `/v1/guilds/${workingGuildId}/state`,
        activeServer.membershipToken,
      );
      setGuildState(state);
      setStatus(`${kind[0].toUpperCase()}${kind.slice(1)} deleted.`);
    } catch (error) {
      setStatus(`Delete channel failed: ${error.message}`);
    } finally {
      setChannelContextMenu(null);
      setCategoryContextMenu(null);
    }
  }

  async function copyServerId(serverId) {
    try {
      await navigator.clipboard.writeText(serverId);
      setStatus("Server ID copied.");
    } catch {
      setStatus("Could not copy server ID.");
    }
    setServerContextMenu(null);
  }

  function openServerFromContext(serverId) {
    setNavMode("servers");
    setActiveServerId(serverId);
    setServerContextMenu(null);
  }

  async function moveServerInRail(serverId, direction) {
    const index = servers.findIndex((server) => server.id === serverId);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= servers.length) return;
    const reordered = servers.slice();
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setServers(reordered);
    setServerContextMenu(null);
    try {
      await api("/v1/servers/reorder", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          serverIds: reordered.map((server) => server.id),
        }),
      });
      setStatus("Server order updated.");
    } catch (error) {
      setStatus(`Server reorder failed: ${error.message}`);
    }
  }

  async function leaveServer(server) {
    if (!server?.id) return;
    setServerContextMenu(null);
    const wasActive = activeServerId === server.id;
    if (wasActive) {
      setActiveServerId("");
      setActiveGuildId("");
      setGuildState(null);
      setMessages([]);
    }
    try {
      await api(`/v1/servers/${server.id}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (server.defaultGuildId && server.baseUrl) {
        try {
          await nodeApi(
            server.baseUrl,
            `/v1/guilds/${server.defaultGuildId}/leave`,
            server.membershipToken,
            { method: "POST", body: "{}" },
          );
        } catch {
          // membership already gone on core; node leave is best-effort
        }
      }
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
      setServers(next);
      if (wasActive && next.length) setActiveServerId(next[0].id);
      setStatus("Left server.");
    } catch (error) {
      setStatus(`Leave failed: ${error.message}`);
    }
  }

  async function deleteServer(server) {
    if (!server?.id || !(server.roles || []).includes("owner")) return;
    if (
      !(await confirmDialog(
        `Delete "${server.name}"? This cannot be undone. All members will lose access.`,
        "Delete Server",
      ))
    )
      return;
    setServerContextMenu(null);
    try {
      await api(`/v1/servers/${server.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
      setServers(next);
      if (activeServerId === server.id) {
        setActiveServerId(next.length ? next[0].id : "");
        setActiveGuildId("");
        setGuildState(null);
        setMessages([]);
      }
      setStatus("Server deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
  }

  async function deleteServerMessage(messageId) {
    if (!activeServer || !activeChannelId || !messageId) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${activeChannelId}/messages/${messageId}`,
        activeServer.membershipToken,
        { method: "DELETE", body: "{}" },
      );
      setMessages((current) =>
        current.filter((message) => message.id !== messageId),
      );
      setStatus("Message deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
    setMessageContextMenu(null);
  }

  async function deleteDmMessage(messageId) {
    if (!activeDmId || !messageId) return;
    try {
      await api(`/v1/social/dms/${activeDmId}/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setDms((current) =>
        current.map((item) =>
          item.id === activeDmId
            ? {
                ...item,
                messages: (item.messages || []).filter(
                  (message) => message.id !== messageId,
                ),
              }
            : item,
        ),
      );
      setStatus("DM message deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
    setMessageContextMenu(null);
  }

  async function loadServerPins(channelId = activeChannelId) {
    if (!activeServer || !channelId) return;
    try {
      const data = await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}/pins`,
        activeServer.membershipToken,
      );
      setPinnedServerMessages((current) => ({
        ...current,
        [channelId]: Array.isArray(data?.pins) ? data.pins : [],
      }));
    } catch (error) {
      setStatus(`Failed to load pinned messages: ${error.message}`);
    }
  }

  async function togglePinMessage(message) {
    if (!message?.id) return;

    if (message.kind === "server") {
      if (!activeServer || !activeChannelId) return;
      const existing = pinnedServerMessages[activeChannelId] || [];
      const isPinned = existing.some((item) => item.id === message.id);
      try {
        await nodeApi(
          activeServer.baseUrl,
          `/v1/channels/${activeChannelId}/pins/${message.id}`,
          activeServer.membershipToken,
          { method: isPinned ? "DELETE" : "PUT", body: "{}" },
        );
        await loadServerPins(activeChannelId);
        setStatus("Updated pinned messages.");
      } catch (error) {
        setStatus(`Pin update failed: ${error.message}`);
      }
      return;
    }

    if (message.kind === "dm") {
      if (!activeDmId) return;
      setPinnedDmMessages((current) => {
        const existing = current[activeDmId] || [];
        const isPinned = existing.some((item) => item.id === message.id);
        const next = isPinned
          ? existing.filter((item) => item.id !== message.id)
          : [
              {
                id: message.id,
                author: message.author,
                content: message.content,
              },
              ...existing,
            ].slice(0, 50);
        return { ...current, [activeDmId]: next };
      });
      setStatus("Updated pinned messages.");
    }
  }

  function isMessagePinned(message) {
    if (!message?.id) return false;
    if (message.kind === "server")
      return activePinnedServerMessages.some((item) => item.id === message.id);
    if (message.kind === "dm")
      return activePinnedDmMessages.some((item) => item.id === message.id);
    return false;
  }

  function waitForVoiceEvent({
    type,
    match = null,
    timeoutMs = 10000,
    guildId = null,
    channelId = null,
    sessionToken = null,
    transportId = null,
  }) {
    return new Promise((resolve, reject) => {
      const key = type;
      const bucket = pendingVoiceEventsRef.current.get(key) || [];
      const pending = {
        match,
        guildId,
        channelId,
        sessionToken,
        transportId,
        resolve,
        reject,
        timeout: setTimeout(() => {
          reject(new Error(`${type}_TIMEOUT`));
          const current = pendingVoiceEventsRef.current.get(key) || [];
          pendingVoiceEventsRef.current.set(
            key,
            current.filter((entry) => entry !== pending),
          );
        }, timeoutMs),
      };
      bucket.push(pending);
      pendingVoiceEventsRef.current.set(key, bucket);
    });
  }

  function resolvePendingVoiceEvent(msg) {
    if (msg?.op !== "DISPATCH" || typeof msg.t !== "string") return;
    const bucket = pendingVoiceEventsRef.current.get(msg.t);
    if (!bucket?.length) return;
    const data = msg.d || {};
    const isTransportConnected = msg.t === "VOICE_TRANSPORT_CONNECTED";
    if (import.meta.env.DEV && isTransportConnected) {
      console.debug("[voice] VOICE_TRANSPORT_CONNECTED received", data);
    }
    const remaining = [];
    for (const pending of bucket) {
      const guildMatches = isTransportConnected
        ? !pending.guildId ||
          data.guildId == null ||
          data.guildId === pending.guildId
        : !pending.guildId || data.guildId === pending.guildId;
      const channelMatches = isTransportConnected
        ? !pending.channelId ||
          data.channelId == null ||
          data.channelId === pending.channelId
        : !pending.channelId || data.channelId === pending.channelId;
      const transportMatches =
        !isTransportConnected ||
        !pending.transportId ||
        data.transportId === pending.transportId;
      const matchOk = !pending.match || pending.match(data, msg);
      if (guildMatches && channelMatches && transportMatches && matchOk) {
        clearTimeout(pending.timeout);
        pending.resolve(data);
        continue;
      }
      remaining.push(pending);
    }
    if (remaining.length) pendingVoiceEventsRef.current.set(msg.t, remaining);
    else pendingVoiceEventsRef.current.delete(msg.t);
  }

  function rejectPendingVoiceEventsByScope({
    guildId = null,
    channelId = null,
    reason = "VOICE_REQUEST_CANCELLED",
  } = {}) {
    for (const [key, bucket] of pendingVoiceEventsRef.current.entries()) {
      const remaining = [];
      for (const pending of bucket) {
        const guildMatches =
          !guildId || !pending.guildId || pending.guildId === guildId;
        const channelMatches =
          !channelId || !pending.channelId || pending.channelId === channelId;
        if (guildMatches && channelMatches) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(reason));
          continue;
        }
        remaining.push(pending);
      }
      if (remaining.length) pendingVoiceEventsRef.current.set(key, remaining);
      else pendingVoiceEventsRef.current.delete(key);
    }
  }

  function rejectPendingVoiceEvents(reason = "VOICE_REQUEST_CANCELLED") {
    for (const [key, bucket] of pendingVoiceEventsRef.current.entries()) {
      for (const pending of bucket) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(reason));
      }
      pendingVoiceEventsRef.current.delete(key);
    }
  }

  async function cleanupVoiceRtc() {
    rejectPendingVoiceEvents("VOICE_SESSION_CLEANUP");
    await voiceSfuRef.current?.stopSelfMonitor?.().catch(() => {});
    micMonitorRestoreStateRef.current = {
      muted: false,
      deafened: false,
      shouldRestore: false,
    };
    setIsMicMonitorActive(false);
    await voiceSfuRef.current?.cleanup();
    setIsCameraEnabled(false);
    setIsScreenSharing(false);
    setLocalCameraStream(null);
    setRemoteVideoStreamsByProducerId({});
    setSelectedScreenShareProducerId("");
  }

  async function waitForVoiceGatewayReady(timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      // Prefer the dedicated private-call gateway when it's live — this keeps
      // private-call voice traffic completely separate from the server node WS.
      const pcWs = privateCallGatewayWsRef.current;
      if (
        pcWs &&
        pcWs.readyState === WebSocket.OPEN &&
        privateCallGatewayReadyRef.current
      )
        return pcWs;

      const ws = nodeGatewayWsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && nodeGatewayReadyRef.current)
        return ws;

      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    // Build a descriptive error so problems are easy to diagnose
    const pcWs = privateCallGatewayWsRef.current;
    const pcState = pcWs?.readyState;
    const wsState = nodeGatewayWsRef.current?.readyState;
    const stateName = (s) =>
      s === WebSocket.CONNECTING
        ? "CONNECTING"
        : s === WebSocket.OPEN
          ? "OPEN"
          : s === WebSocket.CLOSING
            ? "CLOSING"
            : s === WebSocket.CLOSED
              ? "CLOSED"
              : "MISSING";

    const candidates = voiceGatewayCandidatesRef.current?.length
      ? voiceGatewayCandidatesRef.current.join(",")
      : "none";

    throw new Error(
      `VOICE_GATEWAY_UNAVAILABLE:` +
        `pcReady=${privateCallGatewayReadyRef.current ? "1" : "0"},pcWs=${stateName(pcState)},` +
        `nodeReady=${nodeGatewayReadyRef.current ? "1" : "0"},nodeWs=${stateName(wsState)},` +
        `candidates=${candidates}`,
    );
  }

  async function sendNodeVoiceDispatch(type, data) {
    const ws = await waitForVoiceGatewayReady();
    ws.send(JSON.stringify({ op: "DISPATCH", t: type, d: data }));
  }

  function canUseRealtimeVoiceGateway() {
    const ws = nodeGatewayWsRef.current;
    const usable = !!(
      ws &&
      ws.readyState === WebSocket.OPEN &&
      nodeGatewayReadyRef.current
    );
    if (voiceDebugEnabled) {
      const wsState = ws?.readyState;
      const wsStateName =
        wsState === WebSocket.CONNECTING
          ? "CONNECTING"
          : wsState === WebSocket.OPEN
            ? "OPEN"
            : wsState === WebSocket.CLOSING
              ? "CLOSING"
              : wsState === WebSocket.CLOSED
                ? "CLOSED"
                : "MISSING";
      voiceDebug("canUseRealtimeVoiceGateway", {
        usable,
        readyState: wsStateName,
        gatewayReady: nodeGatewayReadyRef.current,
        activeGuildId,
        activeChannelId,
      });
    }
    return usable;
  }

  function selectScreenShare(producerId) {
    const id = String(producerId || "").trim();
    if (!id) return;
    setSelectedScreenShareProducerId(id);
  }

  async function openCurrentCallView() {
    if (activePrivateCall?.callId) {
      let matchingDm = dms.find(
        (dm) => dm.participantId === activePrivateCall?.otherUserId,
      );
      if (!matchingDm && activePrivateCall?.otherUserId) {
        const matchingFriend =
          friends.find((friend) => friend.id === activePrivateCall.otherUserId) ||
          {
            id: activePrivateCall.otherUserId,
            username:
              activePrivateCall.otherName || activePrivateCall.otherUserId,
          };
        const threadId = await openDmFromFriend(matchingFriend);
        if (threadId) {
          matchingDm = { id: threadId };
        }
      }
      if (matchingDm?.id) {
        setActiveDmId(matchingDm.id);
      }
      setNavMode("dms");
      setPrivateCallViewOpen(enrichedRemoteScreenShares.length === 0);
      return;
    }
    if (!voiceConnectedChannelId) return;
    const targetServer =
      voiceConnectedServer ||
      servers.find((server) => server.defaultGuildId === voiceConnectedGuildId) ||
      null;
    if (targetServer?.id) {
      setActiveServerId(targetServer.id);
    }
    if (voiceConnectedGuildId) {
      setActiveGuildId(voiceConnectedGuildId);
    }
    setNavMode("servers");
    setActiveChannelId(voiceConnectedChannelId);
  }

  async function setServerVoiceMemberState(channelId, memberId, patch = {}) {
    if (
      !activeServer?.baseUrl ||
      !activeServer?.membershipToken ||
      !channelId ||
      !memberId
    )
      return;
    const hasMuted = patch.muted !== undefined;
    const hasDeafened = patch.deafened !== undefined;
    if (!hasMuted && !hasDeafened) return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}/voice/members/${memberId}/state`,
        activeServer.membershipToken,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      const actionParts = [];
      if (hasMuted) actionParts.push(patch.muted ? "muted" : "unmuted");
      if (hasDeafened)
        actionParts.push(patch.deafened ? "deafened" : "undeafened");
      setStatus(`Voice member ${actionParts.join(" and ")}.`);
    } catch (error) {
      setStatus(
        `Voice moderation failed: ${error.message || "VOICE_MODERATION_FAILED"}`,
      );
    }
  }

  async function disconnectVoiceMember(channelId, memberId) {
    if (
      !activeServer?.baseUrl ||
      !activeServer?.membershipToken ||
      !channelId ||
      !memberId
    )
      return;
    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channelId}/voice/members/${memberId}/disconnect`,
        activeServer.membershipToken,
        { method: "POST" },
      );
      setStatus("Voice member disconnected.");
    } catch (error) {
      setStatus(
        `Disconnect failed: ${error.message || "VOICE_DISCONNECT_FAILED"}`,
      );
    }
  }

  async function joinVoiceChannel(channel) {
    if (
      !channel?.id ||
      !activeGuildId ||
      !activeServer?.baseUrl ||
      !activeServer?.membershipToken
    )
      return;
    let sfuError = null;
    try {
      setStatus(`Joining ${channel.name}...`);
      await voiceSfuRef.current?.join({
        guildId: activeGuildId,
        channelId: channel.id,
        audioInputDeviceId,
        micGain,
        noiseSuppression: noiseSuppressionEnabled,
        noiseSuppressionPreset,
        noiseSuppressionConfig,
        isMuted,
        isDeafened,
        audioOutputDeviceId,
      });
      setVoiceSession({ guildId: activeGuildId, channelId: channel.id });
      setStatus(`Joined ${channel.name}.`);
      return;
    } catch (error) {
      sfuError = error;
    }

    const allowRestFallback =
      String(import.meta.env.VITE_ENABLE_REST_VOICE_FALLBACK || "").trim() ===
      "1";
    if (!allowRestFallback) {
      const reason = sfuError?.message || "VOICE_GATEWAY_UNAVAILABLE";
      const message = `Voice connection failed: ${reason}. Realtime voice gateway is required; set VITE_ENABLE_REST_VOICE_FALLBACK=1 only for diagnostics.`;
      setStatus(message);
      await alertDialog(message, "Voice Error");
      return;
    }

    try {
      await nodeApi(
        activeServer.baseUrl,
        `/v1/channels/${channel.id}/voice/join`,
        activeServer.membershipToken,
        { method: "POST" },
      );
      setVoiceSession({ guildId: activeGuildId, channelId: channel.id });
      const fallbackReason = sfuError?.message
        ? ` (gateway fallback: ${sfuError.message})`
        : "";
      setStatus(
        `Joined ${channel.name} (REST voice mode, no SFU playback).${fallbackReason}`,
      );
    } catch (error) {
      const message = `Voice connection failed: ${error.message || "VOICE_JOIN_FAILED"}`;
      setStatus(message);
      await alertDialog(message, "Voice Error");
    }
  }

  // ── Private call functions ──────────────────────────────────────────────────

  /**
   * Initiate a 1:1 voice call with a friend.
   * Shows an outgoing call toast while waiting for them to accept.
   */
  async function initiatePrivateCall(friendId, friendName, friendPfp) {
    if (!accessToken || !friendId) return;
    setOutgoingCall({
      calleeId: friendId,
      calleeName: friendName || friendId,
      calleePfp: friendPfp || null,
      callId: null,
    });
    try {
      const data = await api("/call/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: friendId }),
      });
      if (!data?.success || data?.warning) {
        setOutgoingCall(null);
        const reason = data?.message || data?.error || "CALL_CREATE_FAILED";
        setStatus(`Call failed: ${reason}`);
        if (data?.warning === "voice_unavailable") {
          await alertDialog(reason, "Call Error");
        }
        return;
      }
      if (data?.call_id) {
        setOutgoingCall((prev) =>
          prev && prev.calleeId === friendId
            ? { ...prev, callId: data.call_id }
            : prev,
        );
      }
    } catch (err) {
      setOutgoingCall(null);
      setStatus(`Call failed: ${err.message || "CALL_CREATE_FAILED"}`);
    }
  }

  /**
   * Connect to the voice channel for an accepted private call.
   * Opens a dedicated WebSocket to the official node (via core gateway proxy)
   * so it doesn't interfere with the current server node connection.
   */
  async function joinPrivateVoiceCall(callId) {
    if (!accessToken || !callId) return;
    setIncomingCall(null);

    try {
      setStatus("Joining voice call…");

      // 1. Ask core for a membership token + channel info
      const joinData = await api("/call/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ callId }),
      });

      if (!joinData?.success) {
        const reason = joinData?.error || "CALL_JOIN_FAILED";
        setStatus(`Voice join failed: ${reason}`);
        await alertDialog(`Could not join the call: ${reason}`, "Call Error");
        return;
      }

      const { membershipToken, nodeBaseUrl, guildId, channelId } = joinData;
      if (!membershipToken || !nodeBaseUrl || !guildId || !channelId) {
        setStatus("Voice join failed: incomplete call data from server.");
        return;
      }

      // 2. Open a dedicated gateway WS to the official node.
      //    The core gateway will proxy voice traffic when given a membershipToken.
      const coreGatewayWsUrl = (() => {
        const candidates = getCoreGatewayWsCandidates();
        return candidates[0] || getDefaultCoreGatewayWsUrl();
      })();

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(coreGatewayWsUrl);
        privateCallGatewayWsRef.current = ws;
        privateCallGatewayReadyRef.current = false;
        let settled = false;

        const finishResolve = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };

        const finishReject = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(
            error instanceof Error
              ? error
              : new Error(String(error || "PRIVATE_CALL_GATEWAY_ERROR")),
          );
        };

        const timeout = setTimeout(() => {
          try {
            ws.close();
          } catch {}
          finishReject(new Error("PRIVATE_CALL_GATEWAY_TIMEOUT"));
        }, 15000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ op: "IDENTIFY", d: { membershipToken } }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            resolvePendingVoiceEvent(msg);

            if (msg.op === "HELLO" && msg.d?.heartbeat_interval) {
              if (privateCallGatewayHeartbeatRef.current)
                clearInterval(privateCallGatewayHeartbeatRef.current);
              privateCallGatewayHeartbeatRef.current = setInterval(() => {
                if (
                  privateCallGatewayWsRef.current?.readyState === WebSocket.OPEN
                )
                  privateCallGatewayWsRef.current.send(
                    JSON.stringify({ op: "HEARTBEAT" }),
                  );
              }, msg.d.heartbeat_interval);
              return;
            }

            if (msg.op === "READY") {
              privateCallGatewayReadyRef.current = true;
              finishResolve();
              return;
            }

            if (msg.op === "ERROR") {
              finishReject(
                new Error(msg.d?.error || "PRIVATE_CALL_GATEWAY_ERROR"),
              );
            }
          } catch {}
        };

        ws.onerror = () => finishReject(new Error("PRIVATE_CALL_GATEWAY_WS_ERROR"));
        ws.onclose = (event) => {
          privateCallGatewayReadyRef.current = false;
          if (privateCallGatewayHeartbeatRef.current) {
            clearInterval(privateCallGatewayHeartbeatRef.current);
            privateCallGatewayHeartbeatRef.current = null;
          }
          if (!settled) {
            const closeReason = String(event?.reason || "").trim();
            const closeCode = Number(event?.code || 1000);
            finishReject(
              new Error(
                closeReason
                  ? `PRIVATE_CALL_GATEWAY_CLOSED:${closeReason}`
                  : `PRIVATE_CALL_GATEWAY_CLOSED_${closeCode}`,
              ),
            );
          }
        };
      });

      // 3. Join voice via the SFU (which now routes through privateCallGatewayWsRef)
      await voiceSfuRef.current?.join({
        guildId,
        channelId,
        audioInputDeviceId,
        micGain,
        noiseSuppression: noiseSuppressionEnabled,
        noiseSuppressionPreset,
        noiseSuppressionConfig,
        isMuted,
        isDeafened,
        audioOutputDeviceId,
      });

      setVoiceSession({ guildId, channelId });
      setActivePrivateCall({
        callId,
        channelId,
        guildId,
        nodeBaseUrl,
        otherUserId: incomingCall?.callerId || outgoingCall?.calleeId || "",
        otherName: incomingCall?.callerName || outgoingCall?.calleeName || "",
        otherPfp: incomingCall?.callerPfp || outgoingCall?.calleePfp || null,
      });
      setPrivateCallViewOpen(false);
      setOutgoingCall(null);
      setCallDuration(0);
      setStatus("Voice call connected.");
    } catch (err) {
      privateCallGatewayReadyRef.current = false;
      if (privateCallGatewayWsRef.current) {
        try {
          privateCallGatewayWsRef.current.close();
        } catch {}
        privateCallGatewayWsRef.current = null;
      }
      setOutgoingCall(null);
      const reason = err.message || "VOICE_JOIN_FAILED";
      setStatus(`Voice call failed: ${reason}`);
      await alertDialog(`Could not connect to voice: ${reason}`, "Call Error");
    }
  }

  /**
   * Tear down the local private-call session and dedicated gateway state.
   * Optionally scopes the cleanup to a specific call ID.
   */
  async function clearPrivateCallLocally(callId = "", statusMessage = "") {
    const activeCallId = activePrivateCallRef.current?.callId || "";
    const shouldTearDownActiveSession = !callId || activeCallId === callId;

    if (callId) {
      setIncomingCall((prev) => (prev?.callId === callId ? null : prev));
      setOutgoingCall((prev) => (prev?.callId === callId ? null : prev));
    } else {
      setIncomingCall(null);
      setOutgoingCall(null);
    }

    if (!shouldTearDownActiveSession) return;

    setActivePrivateCall(null);
    setPrivateCallViewOpen(false);
    setCallDuration(0);

    await cleanupVoiceRtc().catch(() => {});
    setVoiceSession({ guildId: "", channelId: "" });

    if (privateCallGatewayWsRef.current) {
      try {
        privateCallGatewayWsRef.current.close();
      } catch {}
      privateCallGatewayWsRef.current = null;
    }
    privateCallGatewayReadyRef.current = false;
    if (privateCallGatewayHeartbeatRef.current) {
      clearInterval(privateCallGatewayHeartbeatRef.current);
      privateCallGatewayHeartbeatRef.current = null;
    }

    if (statusMessage) {
      setStatus(statusMessage);
    }
  }

  async function endPrivateCall() {
    const call = activePrivateCall;
    await clearPrivateCallLocally(call?.callId || "");

    // Notify the server
    if (call?.callId && accessToken) {
      try {
        await api("/call/end", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ callId: call.callId }),
        });
      } catch {}
    }
  }

  // ── Call duration ticker ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activePrivateCall) {
      setCallDuration(0);
      setPrivateCallViewOpen(false);
      return;
    }
    const id = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [activePrivateCall?.callId]);

  useEffect(() => {
    const trackedCallId = activePrivateCall?.callId;
    if (!trackedCallId || !accessToken) return;

    let cancelled = false;
    let intervalId = null;
    let inactiveMisses = 0;

    const pollStatus = async () => {
      try {
        const data = await api("/call/get_status", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            callId: trackedCallId,
            requireConnected: true,
          }),
        });
        if (cancelled) return;
        if (data?.success && data?.active && data?.connected) {
          inactiveMisses = 0;
          return;
        }
        inactiveMisses += 1;
        if (inactiveMisses < 2) return;
        await clearPrivateCallLocally(
          trackedCallId,
          "Private call ended because no live voice session was found.",
        );
      } catch {
        // Ignore transient status-check failures and try again on the next tick.
      }
    };

    const startTimer = setTimeout(() => {
      void pollStatus();
      intervalId = setInterval(() => {
        void pollStatus();
      }, 10000);
    }, 15000);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, [activePrivateCall?.callId, accessToken]);

  // ── End private call functions ──────────────────────────────────────────────

  async function toggleCamera() {
    if (!isInVoiceChannel) return;
    try {
      if (isCameraEnabled) {
        await voiceSfuRef.current?.stopCamera();
        setStatus("Camera turned off.");
      } else {
        await voiceSfuRef.current?.startCamera();
        setStatus("Camera turned on.");
      }
    } catch (error) {
      const reason = String(error?.name || error?.message || "");
      if (
        reason === "NotAllowedError" ||
        reason === "PermissionDeniedError" ||
        reason.includes("Permission denied")
      ) {
        setStatus("Camera access was denied.");
        await alertDialog(
          "OpenCom needs camera permission before you can turn your webcam on.",
          "Camera Permission Needed",
        );
        return;
      }
      if (reason === "NotFoundError" || reason === "CAMERA_TRACK_NOT_FOUND") {
        setStatus("No camera was found.");
        await alertDialog(
          "No usable camera device was found for this call.",
          "Camera Not Found",
        );
        return;
      }
      const message = `Camera failed: ${error?.message || "CAMERA_FAILED"}`;
      setStatus(message);
      await alertDialog(message, "Camera Error");
    }
  }

  async function toggleScreenShare() {
    if (!isInVoiceChannel) return;
    try {
      if (isScreenSharing) {
        await voiceSfuRef.current?.stopScreenShare();
        setStatus("Screen sharing stopped.");
      } else {
        await voiceSfuRef.current?.startScreenShare();
        setStatus("Screen sharing started.");
      }
    } catch (error) {
      const reason = error?.message || "";
      if (
        reason === "SCREEN_SOURCE_CANCELLED" ||
        reason === "NotAllowedError"
      ) {
        setStatus("Screen sharing cancelled.");
        return;
      }
      const message = `Screen sharing failed: ${error.message || "SCREEN_SHARE_FAILED"}`;
      setStatus(message);
      await alertDialog(message, "Screen Share Error");
    }
  }

  async function stopMicMonitor({
    restoreState = true,
    announce = false,
  } = {}) {
    await voiceSfuRef.current?.stopSelfMonitor?.().catch(() => {});
    const restore = micMonitorRestoreStateRef.current || {
      muted: false,
      deafened: false,
      shouldRestore: false,
    };
    micMonitorRestoreStateRef.current = {
      muted: false,
      deafened: false,
      shouldRestore: false,
    };
    setIsMicMonitorActive(false);
    if (restoreState && restore.shouldRestore) {
      setIsMuted(!!restore.muted);
      setIsDeafened(!!restore.deafened);
    }
    if (announce) {
      setStatus("Mic test stopped.");
    }
  }

  async function toggleMicMonitor() {
    if (isMicMonitorActive) {
      await stopMicMonitor({ restoreState: true, announce: true });
      return;
    }
    if (!isInVoiceChannel) {
      setStatus("Join a voice channel to test your microphone.");
      return;
    }

    const restoreState = {
      muted: !!isMuted,
      deafened: !!isDeafened,
      shouldRestore: true,
    };
    micMonitorRestoreStateRef.current = restoreState;
    setIsMuted(true);
    setIsDeafened(true);

    try {
      await voiceSfuRef.current?.startSelfMonitor?.();
      setIsMicMonitorActive(true);
      setStatus(
        "Mic test started. You are muted and deafened while hearing your processed mic.",
      );
    } catch (error) {
      micMonitorRestoreStateRef.current = {
        muted: false,
        deafened: false,
        shouldRestore: false,
      };
      setIsMuted(restoreState.muted);
      setIsDeafened(restoreState.deafened);

      const reason = String(error?.message || "").trim();
      if (reason === "MIC_TEST_NOT_READY") {
        setStatus("Mic test failed: microphone stream is not ready.");
        return;
      }
      if (reason === "NotAllowedError") {
        setStatus(
          "Mic test failed: playback was blocked by browser permissions.",
        );
        return;
      }
      setStatus(`Mic test failed: ${reason || "MIC_TEST_FAILED"}`);
    }
  }

  async function leaveVoiceChannel() {
    if (isDisconnectingVoice) return;

    let targetGuildId = voiceConnectedGuildId;
    let targetChannelId = voiceConnectedChannelId;

    if (!targetGuildId || !targetChannelId) {
      for (const [guildId, byUser] of Object.entries(
        voiceStatesByGuild || {},
      )) {
        const selfState = byUser?.[me?.id];
        if (selfState?.channelId) {
          targetGuildId = guildId;
          targetChannelId = selfState.channelId;
          break;
        }
      }
    }

    if (!targetChannelId) {
      const selfState = mergedVoiceStates.find(
        (state) => state.userId === me?.id,
      );
      if (selfState?.channelId) {
        targetGuildId = targetGuildId || activeGuildId || "";
        targetChannelId = selfState.channelId;
      }
    }

    const connectedServer =
      servers.find((server) => server.defaultGuildId === targetGuildId) ||
      activeServer ||
      null;

    const forceLocalDisconnect = async () => {
      setVoiceSession({ guildId: "", channelId: "" });
      setIsCameraEnabled(false);
      setIsScreenSharing(false);
      setLocalCameraStream(null);
      setRemoteVideoStreamsByProducerId({});
      setIsMuted(false);
      setIsDeafened(false);
      if (me?.id) {
        setVoiceStatesByGuild((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const guildId of Object.keys(next)) {
            if (!next[guildId]?.[me.id]) continue;
            const nextGuild = { ...next[guildId] };
            delete nextGuild[me.id];
            next[guildId] = nextGuild;
            changed = true;
          }
          return changed ? next : prev;
        });
      }
      await cleanupVoiceRtc();
    };

    setIsDisconnectingVoice(true);
    try {
      await forceLocalDisconnect();
      setStatus("Disconnected from voice.");

      if (!targetGuildId || !targetChannelId) {
        if (!connectedServer?.baseUrl || !connectedServer?.membershipToken)
          return;
        try {
          await nodeApi(
            connectedServer.baseUrl,
            "/v1/me/voice-disconnect",
            connectedServer.membershipToken,
            { method: "POST" },
          );
        } catch (error) {
          const message = `Disconnected locally. Server voice leave failed: ${error.message || "VOICE_LEAVE_FAILED"}`;
          setStatus(message);
          console.warn(message);
        }
        return;
      }

      if (canUseRealtimeVoiceGateway()) {
        try {
          await sendNodeVoiceDispatch("VOICE_LEAVE", {
            guildId: targetGuildId,
            channelId: targetChannelId,
          });
          return;
        } catch {}
      }

      if (!connectedServer?.baseUrl || !connectedServer?.membershipToken)
        return;

      try {
        if (targetChannelId) {
          await nodeApi(
            connectedServer.baseUrl,
            `/v1/channels/${targetChannelId}/voice/leave`,
            connectedServer.membershipToken,
            { method: "POST" },
          );
          return;
        }
        await nodeApi(
          connectedServer.baseUrl,
          "/v1/me/voice-disconnect",
          connectedServer.membershipToken,
          { method: "POST" },
        );
      } catch (error) {
        const message = `Disconnected locally. Server voice leave failed: ${error.message || "VOICE_LEAVE_FAILED"}`;
        setStatus(message);
        console.warn(message);
      }
    } finally {
      setIsDisconnectingVoice(false);
    }
  }

  async function createOfficialServer() {
    const name = newOfficialServerName.trim();
    if (!name || !accessToken || !newOfficialServerLogoUrl.trim()) return;
    try {
      const data = await api("/v1/servers/official", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name,
          logoUrl: normalizeImageUrlInput(newOfficialServerLogoUrl),
          bannerUrl: normalizeImageUrlInput(newOfficialServerBannerUrl) || null,
        }),
      });
      setNewOfficialServerName("");
      setNewOfficialServerLogoUrl("");
      setNewOfficialServerBannerUrl("");
      setStatus("Your server was created.");
      const refreshed = await api("/v1/servers", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const next = normalizeServerList(refreshed.servers || []);
      setServers(next);
      if (data.serverId && next.length) {
        setActiveServerId(data.serverId);
        setNavMode("servers");
      }
      setAddServerModalOpen(false);
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("SERVER_LIMIT")) setStatus("You already have a server.");
      else if (msg.includes("LOGO_REQUIRED"))
        setStatus("Server logo is required.");
      else if (msg.includes("INVALID_LOGO_URL"))
        setStatus(
          "Invalid server logo URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("INVALID_BANNER_URL"))
        setStatus(
          "Invalid server banner URL. Use uploaded paths (/v1/profile-images/... or users/...) or valid http(s) URLs.",
        );
      else if (msg.includes("OFFICIAL_SERVER_NOT_CONFIGURED"))
        setStatus(
          "Server creation isn’t set up yet. The site admin needs to set OFFICIAL_NODE_SERVER_ID on the API server (same value as NODE_SERVER_ID on the node).",
        );
      else if (msg.includes("OFFICIAL_SERVER_UNAVAILABLE"))
        setStatus("Official server is unavailable. Please try again later.");
      else setStatus(`Failed: ${msg}`);
    }
  }

  function openMessageContextMenu(event, message) {
    event.preventDefault();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 260,
      height: 260,
    });
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setMemberContextMenu(null);
    setMessageContextMenu({
      x: pos.x,
      y: pos.y,
      message: { ...message, pinned: isMessagePinned(message) },
    });
  }

  function openMemberContextMenu(event, member) {
    const memberId = member?.id || member?.userId;
    if (!memberId) return;
    event.preventDefault();
    event.stopPropagation();
    const pos = getContextMenuPoint(event.clientX, event.clientY, {
      width: 280,
      height: 460,
    });
    setServerContextMenu(null);
    setChannelContextMenu(null);
    setCategoryContextMenu(null);
    setMessageContextMenu(null);
    setMemberContextMenu({
      x: pos.x,
      y: pos.y,
      member: { ...member, id: memberId },
    });
  }

  const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB for raw image upload
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB for profile music upload

  function isAcceptedImage(file) {
    if (!file?.type) return false;
    return file.type.startsWith("image/");
  }

  function isAcceptedAudio(file) {
    if (!file?.type) return false;
    return file.type.startsWith("audio/");
  }

  async function uploadProfileImage(file, endpoint) {
    if (!accessToken) throw new Error("AUTH_REQUIRED");
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`${CORE_API}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  }

  async function onImageFieldUpload(event, label, onUploaded) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setStatus("Please choose an image (PNG, JPG, GIF, WebP, etc.).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus(
        `Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
      return;
    }
    try {
      setStatus(`Uploading ${label}...`);
      const data = await uploadProfileImage(file, "/v1/images/upload");
      if (!data?.imageUrl) throw new Error("UPLOAD_FAILED");
      onUploaded(data.imageUrl);
      setStatus(`${label} uploaded.`);
    } catch (error) {
      setStatus(error?.message || "Upload failed.");
    }
  }

  async function onAudioFieldUpload(event, label, onUploaded) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedAudio(file)) {
      setStatus("Please choose an audio file (MP3, WAV, OGG, M4A).");
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setStatus(
        `Audio too large. Max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB.`,
      );
      return;
    }
    try {
      setStatus(`Uploading ${label}...`);
      const data = await uploadProfileImage(file, "/v1/media/upload");
      if (!data?.mediaUrl) throw new Error("UPLOAD_FAILED");
      onUploaded(data.mediaUrl);
      setStatus(`${label} uploaded.`);
    } catch (error) {
      setStatus(error?.message || "Upload failed.");
    }
  }

  async function onAvatarUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setStatus("Please choose an image (PNG, JPG, GIF, WebP, etc.).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus(
        `Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
      return;
    }
    try {
      setStatus("Uploading avatar…");
      const data = await uploadProfileImage(file, "/v1/me/profile/pfp");
      setProfileForm((current) => ({ ...current, pfpUrl: data.pfpUrl || "" }));
      setProfile(profile ? { ...profile, pfpUrl: data.pfpUrl } : null);
      setStatus("Avatar updated.");
    } catch (e) {
      setStatus(e.message || "Upload failed.");
    }
  }

  async function onBannerUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      setStatus("Please choose an image (PNG, JPG, GIF, WebP, etc.).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus(
        `Image too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
      return;
    }
    try {
      setStatus("Uploading banner…");
      const data = await uploadProfileImage(file, "/v1/me/profile/banner");
      setProfileForm((current) => ({
        ...current,
        bannerUrl: data.bannerUrl || "",
      }));
      setProfile(profile ? { ...profile, bannerUrl: data.bannerUrl } : null);
      setStatus("Banner updated.");
    } catch (e) {
      setStatus(e.message || "Upload failed.");
    }
  }

  async function openMemberProfile(member, anchorPoint = null) {
    if (
      anchorPoint &&
      Number.isFinite(Number(anchorPoint.x)) &&
      Number.isFinite(Number(anchorPoint.y))
    ) {
      setProfileCardPosition(
        clampProfileCardPosition(
          Number(anchorPoint.x) + 12,
          Number(anchorPoint.y) + 12,
          getProfileCardClampOptions(),
        ),
      );
    }
    try {
      const profileData = await api(`/v1/users/${member.id}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setUserCache((prev) => ({
        ...prev,
        [member.id]: {
          username:
            profileData.username ??
            prev[member.id]?.username ??
            member.username,
          displayName:
            profileData.displayName ?? profileData.username ?? member.username,
          pfpUrl: profileData.pfpUrl ?? null,
        },
      }));
      setMemberProfileCard({
        ...profileData,
        fullProfile: normalizeFullProfile(profileData, profileData.fullProfile),
        username: profileData.username || member.username,
        status: getPresence(member.id) || "offline",
        roleIds: member.roleIds || [],
      });
    } catch {
      setMemberProfileCard({
        id: member.id,
        username: member.username || member.id,
        displayName: member.username || member.id,
        bio: "Profile details are private or unavailable.",
        badges: [],
        badgeDetails: [],
        status: getPresence(member.id) || "offline",
        platformTitle: null,
        createdAt: null,
        fullProfile: createBasicFullProfile({
          username: member.username || member.id,
        }),
        roleIds: member.roleIds || [],
      });
    }
  }

  async function openFullProfileViewer(userLikeProfile) {
    if (!userLikeProfile) return;
    const userId = String(userLikeProfile.id || "").trim();
    if (!userId || !accessToken) {
      setFullProfileViewer(userLikeProfile);
      return;
    }
    try {
      const latest = await api(`/v1/users/${userId}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setFullProfileViewer({
        ...userLikeProfile,
        ...latest,
        username: latest.username || userLikeProfile.username || userId,
        displayName:
          latest.displayName ??
          userLikeProfile.displayName ??
          latest.username ??
          userId,
        fullProfile: normalizeFullProfile(latest, latest.fullProfile),
      });
    } catch {
      setFullProfileViewer(userLikeProfile);
    }
  }

  async function toggleFullProfileViewerMusicPlayback() {
    if (!fullProfileViewerHasPlayableMusic) return;
    const audio = fullProfileViewerMusicAudioRef.current;
    if (!audio) return;
    try {
      audio.volume = Math.max(
        0,
        Math.min(
          1,
          Number(fullProfileViewer?.fullProfile?.music?.volume ?? 60) / 100,
        ),
      );
      audio.loop = fullProfileViewer?.fullProfile?.music?.loop !== false;
      if (audio.paused) {
        await audio.play();
        setFullProfileViewerMusicPlaying(true);
      } else {
        audio.pause();
        setFullProfileViewerMusicPlaying(false);
      }
    } catch (error) {
      setStatus(
        `Profile music error: ${error?.message || "AUDIO_PLAYBACK_FAILED"}`,
      );
      setFullProfileViewerMusicPlaying(false);
    }
  }

  function getBadgePresentation(badge) {
    if (
      badge &&
      typeof badge === "object" &&
      (badge.bgColor || badge.icon || badge.name || badge.imageUrl)
    ) {
      return {
        icon: badge.icon || "🏷️",
        imageUrl: profileImageUrl(badge.imageUrl || "") || "",
        name: badge.name || String(badge.id || "Badge"),
        bgColor: badge.bgColor || "#3a4f72",
        fgColor: badge.fgColor || "#ffffff",
      };
    }
    const id = String(badge?.id || badge || "").toLowerCase();
    if (id === "platform_owner")
      return {
        icon: "👑",
        imageUrl: "",
        name: "Platform Owner",
        bgColor: "#2d6cdf",
        fgColor: "#ffffff",
      };
    if (id === "platform_admin")
      return {
        icon: "🔨",
        imageUrl: "",
        name: "Platform Admin",
        bgColor: "#2d6cdf",
        fgColor: "#ffffff",
      };
    if (id === "official")
      return {
        icon: "✓",
        imageUrl: "",
        name: "OFFICIAL",
        bgColor: "#1292ff",
        fgColor: "#ffffff",
      };
    if (id === "boost")
      return {
        icon: "➕",
        imageUrl: "",
        name: "Boost",
        bgColor: "#4f7ecf",
        fgColor: "#ffffff",
      };
    return {
      icon: badge?.icon || "🏷️",
      imageUrl: profileImageUrl(badge?.imageUrl || "") || "",
      name: badge?.name || id || "Badge",
      bgColor: badge?.bgColor || "#3a4f72",
      fgColor: badge?.fgColor || "#ffffff",
    };
  }

  function isOfficialBadge(badge) {
    const id = String(badge?.id || badge || "")
      .trim()
      .toLowerCase();
    return id === "official";
  }

  function hasOfficialBadge(badges = []) {
    return Array.isArray(badges) && badges.some((badge) => isOfficialBadge(badge));
  }

  function renderOfficialBadge(badges = [], extraClassName = "") {
    if (!hasOfficialBadge(badges)) return null;
    const className = ["official-badge", extraClassName].filter(Boolean).join(" ");
    return (
      <span className={className} title="Official OpenCom account">
        <span className="official-badge__tick">✓</span>
        <span className="official-badge__label">OFFICIAL</span>
      </span>
    );
  }

  function getFullProfileFontFamily(preset) {
    const key = String(preset || "")
      .trim()
      .toLowerCase();
    if (key === "serif") return '"Merriweather", Georgia, serif';
    if (key === "mono")
      return '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';
    if (key === "display")
      return '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif';
    return '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
  }

  function getFullProfileElementFrameStyle(element) {
    const radius = Math.max(0, Math.min(40, Number(element?.radius ?? 8)));
    const opacity = Math.max(
      20,
      Math.min(100, Number(element?.opacity ?? 100)),
    );
    const alignRaw = String(element?.align || "")
      .trim()
      .toLowerCase();
    const align =
      alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
    return {
      left: `${element.x}%`,
      top: `${element.y}%`,
      width: `${element.w}%`,
      height: `${element.h}%`,
      borderRadius: `${radius}px`,
      opacity: opacity / 100,
      textAlign: align,
    };
  }

  function renderFullProfileElement(element, viewerProfile, options = {}) {
    if (!element || !viewerProfile) return null;
    const type = String(element.type || "").toLowerCase();
    const alignRaw = String(element.align || "")
      .trim()
      .toLowerCase();
    const textAlign =
      alignRaw === "center" || alignRaw === "right" ? alignRaw : "left";
    const textColor =
      typeof element.color === "string" && element.color.trim()
        ? element.color.trim()
        : undefined;
    const textSize = Math.max(
      10,
      Math.min(
        72,
        Number(
          element.fontSize || (type === "name" ? 22 : type === "bio" ? 14 : 16),
        ),
      ),
    );
    const textStyle = {
      textAlign,
      color: textColor,
      fontSize: `${textSize}px`,
      lineHeight: 1.35,
    };
    if (type === "banner") {
      const banner = profileImageUrl(viewerProfile.bannerUrl || "");
      return banner ? (
        <img src={banner} alt="Banner" className="full-profile-banner-image" />
      ) : (
        <div className="full-profile-banner-fallback" />
      );
    }
    if (type === "avatar") {
      const avatar = profileImageUrl(viewerProfile.pfpUrl || "");
      return (
        <SafeAvatar
          src={avatar}
          alt="Avatar"
          name={viewerProfile.displayName || viewerProfile.username || "U"}
          seed={viewerProfile.id || viewerProfile.username}
          className="full-profile-avatar-element"
          imgClassName="full-profile-avatar-image"
          maxLetters={2}
        />
      );
    }
    if (type === "name") {
      return (
        <strong className="full-profile-rich-text" style={textStyle}>
          {viewerProfile.displayName || viewerProfile.username || "User"}
        </strong>
      );
    }
    if (type === "bio") {
      return (
        <span className="full-profile-rich-text" style={textStyle}>
          {viewerProfile.bio || "No bio set."}
        </span>
      );
    }
    if (type === "links") {
      const links = Array.isArray(viewerProfile.fullProfile?.links)
        ? viewerProfile.fullProfile.links
        : [];
      return (
        <div className="full-profile-links-list" style={textStyle}>
          {links.length === 0 && (
            <span className="hint">No links configured.</span>
          )}
          {links.map((link) => (
            <a
              key={link.id || link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
        </div>
      );
    }
    if (type === "music") {
      const hasMusicUrl = !!String(
        viewerProfile.fullProfile?.music?.url || "",
      ).trim();
      if (!hasMusicUrl)
        return (
          <span className="full-profile-music-pill muted">♪ No track</span>
        );
      const isPlaying = !!options.musicPlaying;
      return (
        <span
          className={`full-profile-music-pill ${isPlaying ? "playing" : ""}`}
        >
          {isPlaying ? "⏸ Music" : "▶ Music"}
        </span>
      );
    }
    return (
      <span className="full-profile-rich-text" style={textStyle}>
        {element.text || "Custom text"}
      </span>
    );
  }

  function insertEmoteToken(name) {
    const token = `:${name}:`;
    const setComposerText = navMode === "dms" ? setDmText : setMessageText;
    setComposerText((current) => {
      const trimmed = current || "";
      const spacer = trimmed.length > 0 && !/\s$/.test(trimmed) ? " " : "";
      return `${trimmed}${spacer}${token} `;
    });
    setShowEmotePicker(false);
    activeComposerInputRef.current?.focus();
  }

  function renderEmoteSuggestionsPanel() {
    if (showingEmoteSuggestions && !showingSlash) {
      return (
        <div className="slash-command-suggestions">
          <div className="slash-command-header">
            EMOTES MATCHING :{(emoteQuery?.query || "").toUpperCase()}
          </div>
          {emoteSuggestions.length === 0 ? (
            <div className="slash-command-empty">
              No built-in or custom emotes found.
            </div>
          ) : (
            emoteSuggestions.map((emote, index) => (
              <button
                key={emote.id}
                type="button"
                className={`slash-command-item ${index === emoteSelectionIndex ? "active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  applyEmoteSuggestion(emote.name);
                  setEmoteSelectionIndex(index);
                }}
              >
                <div className="emote-suggestion-row">
                  {emote.type === "custom" ? (
                    <img
                      className="message-custom-emote"
                      src={emote.imageUrl}
                      alt={`:${emote.name}:`}
                    />
                  ) : (
                    <span className="emote-suggestion-glyph">
                      {emote.value}
                    </span>
                  )}
                  <strong>:{emote.name}:</strong>
                </div>
                <span>
                  {emote.type === "custom"
                    ? emote.scopeLabel || "Custom"
                    : "Built-in"}
                </span>
              </button>
            ))
          )}
        </div>
      );
    }
    return null;
  }

  function renderEmotePickerPanel() {
    if (!showEmotePicker || showingSlash || showingEmoteSuggestions) return null;
    return (
      <div className="emote-picker">
        {customPickerSections.map((section) => (
          <section key={section.id} className="emote-picker-section">
            <header className="emote-picker-heading">{section.heading}</header>
            <div className="emote-picker-grid">
              {section.items.map((emote) => (
                <button
                  key={emote.id || emote.name}
                  type="button"
                  className="emote-item"
                  onClick={(event) => {
                    event.stopPropagation();
                    insertEmoteToken(emote.name);
                  }}
                  title={`:${emote.name}:`}
                >
                  <img
                    className="message-custom-emote"
                    src={emote.imageUrl}
                    alt={`:${emote.name}:`}
                  />
                  <small>:{emote.name}:</small>
                </button>
              ))}
            </div>
          </section>
        ))}
        {BUILTIN_EMOTE_CATEGORIES.map((category) => (
          <section
            key={category.id}
            className="emote-picker-section"
          >
            <header className="emote-picker-heading">
              {category.label}
            </header>
            <div className="emote-picker-grid">
              {category.items.map((emote) => (
                <button
                  key={`${category.id}:${emote.name}`}
                  type="button"
                  className="emote-item"
                  onClick={(event) => {
                    event.stopPropagation();
                    insertEmoteToken(emote.name);
                  }}
                  title={`:${emote.name}:`}
                >
                  <span>{emote.value}</span>
                  <small>:{emote.name}:</small>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  function resolveReactionDescriptor(input, kind = "server") {
    const raw = String(input || "").trim();
    if (!raw) return null;

    const tokenMatch = raw.match(/^:([a-zA-Z0-9_+-]{2,64}):$/);
    if (tokenMatch) {
      const token = String(tokenMatch[1] || "").trim().toLowerCase();
      if (kind === "server" && currentServerCustomEmoteByName.has(token)) {
        const custom = currentServerCustomEmoteByName.get(token);
        return {
          key: `custom:${custom.name}`,
          type: "custom",
          name: custom.name,
          value: "",
          imageUrl: custom.imageUrl || "",
        };
      }
      if (globalUsableCustomEmoteByName.has(token)) {
        const custom = globalUsableCustomEmoteByName.get(token);
        return {
          key: `custom:${custom.name}`,
          type: "custom",
          name: custom.name,
          value: "",
          imageUrl: custom.imageUrl || "",
        };
      }
      const builtin = BUILTIN_REACTION_ENTRY_BY_TOKEN[token];
      if (builtin) {
        return {
          key: `builtin:${builtin.name}`,
          type: "builtin",
          name: builtin.name,
          value: builtin.value,
          imageUrl: "",
        };
      }
      return null;
    }

    const builtin = BUILTIN_REACTION_ENTRY_BY_VALUE.get(raw);
    if (builtin) {
      return {
        key: `builtin:${builtin.name}`,
        type: "builtin",
        name: builtin.name,
        value: builtin.value,
        imageUrl: "",
      };
    }

    if (/[a-z0-9]/i.test(raw) || /\s/.test(raw)) return null;
    const unicodeKey = buildUnicodeReactionKey(raw);
    if (!unicodeKey) return null;
    return {
      key: `unicode:${unicodeKey}`,
      type: "unicode",
      name: raw,
      value: raw,
      imageUrl: "",
    };
  }

  function applyServerMessageReactions(messageId, reactions = []) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, reactions } : message,
      ),
    );
  }

  function applyDmMessageReactions(threadId, messageId, reactions = []) {
    setDms((current) =>
      current.map((item) =>
        item.id === threadId
          ? {
              ...item,
              messages: (item.messages || []).map((message) =>
                message.id === messageId ? { ...message, reactions } : message,
              ),
            }
          : item,
      ),
    );
  }

  async function setMessageReaction(kind, message, reaction, active) {
    if (!reaction?.key || !message?.id) return;
    const reactionPayload = {
      ...reaction,
      value:
        typeof reaction?.value === "string" && reaction.value.trim()
          ? reaction.value.trim()
          : null,
      imageUrl:
        typeof reaction?.imageUrl === "string" && reaction.imageUrl.trim()
          ? reaction.imageUrl.trim()
          : null,
    };
    try {
      if (kind === "server") {
        if (!activeServer || !activeChannelId) return;
        const data = await nodeApi(
          activeServer.baseUrl,
          `/v1/channels/${activeChannelId}/messages/${message.id}/reactions`,
          activeServer.membershipToken,
          {
            method: active ? "PUT" : "DELETE",
            body: JSON.stringify(reactionPayload),
          },
        );
        applyServerMessageReactions(message.id, data?.reactions || []);
      } else {
        if (!activeDmId) return;
        const data = await api(
          `/v1/social/dms/${activeDmId}/messages/${message.id}/reactions`,
          {
            method: active ? "PUT" : "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(reactionPayload),
          },
        );
        applyDmMessageReactions(activeDmId, message.id, data?.reactions || []);
      }
    } catch (error) {
      setStatus(`Reaction failed: ${error.message}`);
    }
  }

  async function promptAddReactionToMessage(message, kind = "server") {
    const raw = await promptText(
      "Add a reaction with an emoji or :name: emote",
      "👍",
    );
    if (raw == null) return;
    const reaction = resolveReactionDescriptor(raw, kind);
    if (!reaction) {
      setStatus("Unknown reaction. Use an emoji or a valid :name: emote.");
      return;
    }
    await setMessageReaction(kind, message, reaction, true);
  }

  async function addReactionToMessageFromPicker(message, kind, emoteName) {
    const reaction = resolveReactionDescriptor(`:${emoteName}:`, kind);
    if (!reaction) {
      setStatus("Unknown reaction. Use an emoji or a valid :name: emote.");
      return;
    }
    setMessageReactionPicker(null);
    setMessageReactionPickerQuery("");
    await setMessageReaction(kind, message, reaction, true);
  }

  function toggleMessageReactionPicker(message, kind = "server") {
    const messageId = String(message?.id || "").trim();
    if (!messageId) return;
    setShowEmotePicker(false);
    setMessageReactionPickerQuery("");
    setMessageReactionPicker((current) => {
      if (current?.messageId === messageId && current?.kind === kind) {
        return null;
      }
      return { messageId, kind };
    });
  }

  function renderReactionChipGlyph(reaction) {
    if (reaction?.type === "custom" && reaction?.imageUrl) {
      return (
        <img
          className="message-custom-emote"
          src={reaction.imageUrl}
          alt={`:${reaction.name || "emote"}:`}
        />
      );
    }
    if (reaction?.value) {
      return <span>{reaction.value}</span>;
    }
    if (reaction?.name && BUILTIN_EMOTES[reaction.name]) {
      return <span>{BUILTIN_EMOTES[reaction.name]}</span>;
    }
    return <span>{reaction?.name || "?"}</span>;
  }

  function renderMessageReactions(message, kind = "server") {
    const messageId = String(message?.id || "").trim();
    const reactions = Array.isArray(message?.reactions) ? message.reactions : [];
    const hasReactions = reactions.length > 0;
    const canAdd = kind === "server" ? !!activeChannelId : !!activeDmId;
    const pickerOpen =
      messageReactionPicker?.messageId === messageId &&
      messageReactionPicker?.kind === kind;

    if (!hasReactions && !canAdd && !pickerOpen) return null;

    const pickerTrigger = canAdd ? (
      <div
        className={`message-reaction-picker-anchor ${hasReactions ? "inline" : "floating"} ${pickerOpen ? "open" : ""}`}
      >
        <button
          type="button"
          className={`message-reaction-launcher ${pickerOpen ? "active" : ""}`}
          title="Open reaction picker"
          onClick={(event) => {
            event.stopPropagation();
            toggleMessageReactionPicker(message, kind);
          }}
        >
          😀
        </button>
      </div>
    ) : null;

    return (
      <div
        className={`message-reaction-shell ${hasReactions ? "has-reactions" : ""} ${pickerOpen ? "picker-open" : ""}`}
      >
        {hasReactions && (
          <div className="message-reactions-row">
            {reactions.map((reaction) => {
              const reacted = messageHasReactionFromUser(reaction, me?.id);
              const count = Math.max(
                Number.isFinite(Number(reaction?.count))
                  ? Number(reaction.count)
                  : 0,
                getReactionUserIds(reaction).length,
              );
              return (
                <button
                  key={reaction.key}
                  type="button"
                  className={`message-reaction-chip ${reacted ? "active" : ""}`}
                  title={reaction.name || reaction.key}
                  onClick={(event) => {
                    event.stopPropagation();
                    void setMessageReaction(kind, message, reaction, !reacted);
                  }}
                >
                  {renderReactionChipGlyph(reaction)}
                  <strong>{count}</strong>
                </button>
              );
            })}
            {pickerTrigger}
          </div>
        )}
        {!hasReactions && pickerTrigger}
      </div>
    );
  }

  function normalizeComposerDraft(value = "") {
    return String(value || "").replace(/\r\n?/g, "\n");
  }

  function renderContentWithMentions(message) {
    const content = String(message?.content || "").replace(/\r\n?/g, "\n");
    const renderInlineMarkdown = (text, keyPrefix) => {
      if (!text) return [];
      const out = [];
      const inlineRegex =
        /@\{([^}\n]{1,64})\}|@([a-zA-Z0-9_.-]{2,64})|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"'`]+)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_|(\n)|:([a-zA-Z0-9_+-]{2,32}):/g;
      let cursorLocal = 0;
      let match = inlineRegex.exec(text);
      let localIndex = 0;

      while (match) {
        const start = match.index ?? 0;
        if (start > cursorLocal) {
          out.push(
            <span key={`${keyPrefix}-plain-${localIndex}`}>
              {text.slice(cursorLocal, start)}
            </span>,
          );
          localIndex += 1;
        }

        const full = match[0] || "";
        const bracedMention = match[1];
        const simpleMention = match[2];
        const markdownLabel = match[3];
        const markdownUrl = match[4];
        const rawUrl = match[5];
        const inlineCode = match[6];
        const boldA = match[7];
        const boldB = match[8];
        const strike = match[9];
        const italicA = match[10];
        const italicB = match[11];
        const lineBreak = match[12];
        const emoteToken = match[13];

        if (bracedMention || simpleMention) {
          const raw = (bracedMention || simpleMention || "").trim();
          const prevChar = start > 0 ? text[start - 1] : "";
          const mentionAtWordBoundary = start === 0 || /\s/.test(prevChar);

          if (!mentionAtWordBoundary || !raw) {
            out.push(
              <span key={`${keyPrefix}-raw-mention-${localIndex}`}>{full}</span>,
            );
          } else if (raw.toLowerCase() === "everyone") {
            out.push(
              <span
                key={`${keyPrefix}-everyone-${localIndex}`}
                className="message-mention"
              >
                {full}
              </span>,
            );
          } else {
            const member = memberByMentionToken.get(raw.toLowerCase());
            if (member) {
              out.push(
                <button
                  key={`${keyPrefix}-mention-${localIndex}`}
                  type="button"
                  className="message-mention mention-click"
                  onClick={(event) => {
                    event.stopPropagation();
                    openMemberProfile(member, {
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                >
                  @{member.username || member.id}
                </button>,
              );
            } else {
              out.push(
                <span
                  key={`${keyPrefix}-unknown-mention-${localIndex}`}
                  className="message-mention"
                >
                  {full}
                </span>,
              );
            }
          }
        } else if (markdownLabel && markdownUrl) {
          out.push(
            <a
              key={`${keyPrefix}-md-link-${localIndex}`}
              href={markdownUrl}
              target="_blank"
              rel="noreferrer"
            >
              {renderInlineMarkdown(
                markdownLabel,
                `${keyPrefix}-md-link-label-${localIndex}`,
              )}
            </a>,
          );
        } else if (rawUrl) {
          out.push(
            <a
              key={`${keyPrefix}-link-${localIndex}`}
              href={rawUrl}
              target="_blank"
              rel="noreferrer"
            >
              {rawUrl}
            </a>,
          );
        } else if (inlineCode) {
          out.push(
            <code
              key={`${keyPrefix}-code-${localIndex}`}
              className="message-inline-code"
            >
              {inlineCode}
            </code>,
          );
        } else if (boldA || boldB) {
          const inner = boldA || boldB;
          out.push(
            <strong key={`${keyPrefix}-bold-${localIndex}`}>
              {renderInlineMarkdown(
                inner,
                `${keyPrefix}-bold-inner-${localIndex}`,
              )}
            </strong>,
          );
        } else if (strike) {
          out.push(
            <s key={`${keyPrefix}-strike-${localIndex}`}>
              {renderInlineMarkdown(
                strike,
                `${keyPrefix}-strike-inner-${localIndex}`,
              )}
            </s>,
          );
        } else if (italicA || italicB) {
          const inner = italicA || italicB;
          out.push(
            <em key={`${keyPrefix}-italic-${localIndex}`}>
              {renderInlineMarkdown(
                inner,
                `${keyPrefix}-italic-inner-${localIndex}`,
              )}
            </em>,
          );
        } else if (lineBreak) {
          out.push(<br key={`${keyPrefix}-br-${localIndex}`} />);
        } else if (emoteToken) {
          const token = String(emoteToken || "").toLowerCase();
          const emote = BUILTIN_EMOTES[token];
          if (emote) {
            out.push(
              <span
                key={`${keyPrefix}-emote-${localIndex}`}
                className="message-emote"
                title={`:${token}:`}
              >
                {emote}
              </span>,
            );
          } else if (serverEmoteByName.has(token)) {
            const custom = serverEmoteByName.get(token);
            out.push(
              <img
                key={`${keyPrefix}-custom-emote-${localIndex}`}
                className="message-custom-emote"
                src={custom.imageUrl || custom.image_url}
                alt={`:${token}:`}
                title={`:${token}:`}
              />,
            );
          } else if (globalRenderableCustomEmoteByName.has(token)) {
            const custom = globalRenderableCustomEmoteByName.get(token);
            out.push(
              <img
                key={`${keyPrefix}-custom-emote-${localIndex}`}
                className="message-custom-emote"
                src={custom.imageUrl || custom.image_url}
                alt={`:${token}:`}
                title={`:${token}:`}
              />,
            );
          } else {
            out.push(
              <span key={`${keyPrefix}-raw-emote-${localIndex}`}>{full}</span>,
            );
          }
        } else {
          out.push(<span key={`${keyPrefix}-raw-${localIndex}`}>{full}</span>);
        }

        localIndex += 1;
        cursorLocal = start + full.length;
        match = inlineRegex.exec(text);
      }

      if (cursorLocal < text.length) {
        out.push(
          <span key={`${keyPrefix}-tail-${localIndex}`}>
            {text.slice(cursorLocal)}
          </span>,
        );
      }
      return out;
    };

    const renderMarkdownBlock = (block, keyPrefix) => {
      if (!block) return null;

      if (block.type === "rule") {
        return <hr key={`${keyPrefix}-rule`} className="message-rule" />;
      }

      if (block.type === "heading") {
        const HeadingTag = `h${Math.min(Math.max(block.level || 1, 1), 6)}`;
        return (
          <HeadingTag
            key={`${keyPrefix}-heading`}
            className={`message-heading message-heading-${block.level || 1}`}
          >
            {renderInlineMarkdown(
              block.value || "",
              `${keyPrefix}-heading-inline`,
            )}
          </HeadingTag>
        );
      }

      if (block.type === "code") {
        return (
          <pre key={`${keyPrefix}-code`} className="message-code-block">
            <code>{block.value || ""}</code>
          </pre>
        );
      }

      if (block.type === "blockquote") {
        return (
          <blockquote key={`${keyPrefix}-quote`} className="message-quote">
            {(block.blocks || []).map((child, childIndex) =>
              renderMarkdownBlock(child, `${keyPrefix}-quote-${childIndex}`),
            )}
          </blockquote>
        );
      }

      if (block.type === "ordered-list" || block.type === "unordered-list") {
        const ListTag = block.type === "ordered-list" ? "ol" : "ul";
        return (
          <ListTag key={`${keyPrefix}-list`} className="message-list">
            {(block.items || []).map((item, itemIndex) => (
              <li key={`${keyPrefix}-item-${itemIndex}`}>
                {renderInlineMarkdown(
                  item || "",
                  `${keyPrefix}-item-inline-${itemIndex}`,
                )}
              </li>
            ))}
          </ListTag>
        );
      }

      return (
        <p key={`${keyPrefix}-paragraph`} className="message-paragraph">
          {renderInlineMarkdown(
            block.value || "",
            `${keyPrefix}-paragraph-inline`,
          )}
        </p>
      );
    };

    const blocks = parseBlogMarkdown(content);

    return (
      <div className="message-markdown">
        {blocks.map((block, index) =>
          renderMarkdownBlock(block, `message-block-${index}`),
        )}
      </div>
    );
  }

  function normalizedLinkKey(value) {
    try {
      const parsed = new URL(String(value || ""));
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return String(value || "");
    }
  }

  function isImageMimeType(value = "") {
    return /^image\//i.test(String(value || ""));
  }

  function isVideoMimeType(value = "") {
    return /^video\//i.test(String(value || ""));
  }

  function isAudioMimeType(value = "") {
    return /^audio\//i.test(String(value || ""));
  }

  function isLikelyImageUrl(value = "") {
    const raw = String(value || "").trim();
    if (!raw) return false;
    if (/^data:image\//i.test(raw)) return true;
    try {
      const parsed = new URL(raw);
      return /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)(?:[?#]|$)/i.test(
        parsed.pathname || "",
      );
    } catch {
      return /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)(?:[?#]|$)/i.test(raw);
    }
  }

  function getAssetKindFromUrl(value = "") {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^data:image\//i.test(raw)) return "image";
    if (/^data:video\//i.test(raw)) return "video";
    if (/^data:audio\//i.test(raw)) return "audio";
    try {
      const parsed = new URL(raw);
      const pathname = parsed.pathname || "";
      if (/\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)(?:[?#]|$)/i.test(pathname)) {
        return "image";
      }
      if (/\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(pathname)) {
        return "video";
      }
      if (/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)(?:[?#]|$)/i.test(pathname)) {
        return "audio";
      }
    } catch {
      if (/\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)(?:[?#]|$)/i.test(raw)) {
        return "image";
      }
      if (/\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(raw)) {
        return "video";
      }
      if (/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)(?:[?#]|$)/i.test(raw)) {
        return "audio";
      }
    }
    return "";
  }

  function getMediaAssetKind({ url = "", contentType = "" } = {}) {
    if (isImageMimeType(contentType)) return "image";
    if (isVideoMimeType(contentType)) return "video";
    if (isAudioMimeType(contentType)) return "audio";
    return getAssetKindFromUrl(url);
  }

  function getLinkPreviewForUrl(value) {
    const raw = String(value || "");
    if (!raw) return null;
    if (linkPreviewByUrl[raw] !== undefined) return linkPreviewByUrl[raw];
    const normalized = normalizedLinkKey(raw);
    for (const [candidate, preview] of Object.entries(linkPreviewByUrl)) {
      if (normalizedLinkKey(candidate) === normalized) return preview;
    }
    return null;
  }

  function getDerivedLinkEmbeds(message) {
    const urls = extractHttpUrls(message?.content || "");
    if (!urls.length) return [];

    const existing = new Set(
      (message?.linkEmbeds || []).map((embed) => normalizedLinkKey(embed?.url)),
    );
    const out = [];
    for (const rawUrl of urls) {
      const key = normalizedLinkKey(rawUrl);
      if (!key || existing.has(key)) continue;
      const preview = getLinkPreviewForUrl(rawUrl);
      const assetKind = getMediaAssetKind({
        url: preview?.url || rawUrl,
        contentType: "",
      });
      if (!preview) {
        if (!assetKind) continue;
        out.push({
          url: rawUrl,
          title: guessFileNameFromUrl(rawUrl) || "Asset",
          description: "",
          imageUrl: "",
          siteName: "",
          action: null,
          kind: assetKind,
          invite: null,
        });
        continue;
      }
      if (!preview.hasMeta && !preview.action && !assetKind) continue;
      out.push({
        url: preview.url || rawUrl,
        title: preview.title || preview.siteName || "Link",
        description: preview.description || "",
        imageUrl: preview.imageUrl || "",
        siteName: preview.siteName || "",
        action: preview.action || null,
        kind: preview.kind || assetKind || "",
        invite: preview.invite || null,
      });
    }
    return out;
  }

  function isAssetOnlyMessageContent(message) {
    const content = String(message?.content || "").trim();
    if (!content) return false;
    const urls = extractHttpUrls(content);
    if (!urls.length) return false;
    const nonUrlText = content
      .replace(/https?:\/\/[^\s<>"'`)\]]+/gi, " ")
      .trim();
    if (nonUrlText) return false;
    return urls.every((url) => !!getAssetKindFromUrl(url));
  }

  function onMediaCardKeyDown(event, onOpen) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  }

  function openExpandedMediaFromEmbed(embed) {
    const draft = buildFavouriteMediaDraftFromEmbed(embed);
    const imageUrl = String(draft?.sourceUrl || "").trim();
    if (!imageUrl) return;
    setExpandedMedia({
      src: imageUrl,
      title: embed?.title || draft?.fileName || "Image",
      subtitle: embed?.pageUrl || embed?.url || "",
      openHref: embed?.url || draft?.pageUrl || imageUrl,
    });
  }

  function openExpandedMediaFromAttachment(attachment) {
    const imagePreviewUrl = attachmentPreviewUrlById[attachment?.id] || "";
    const directUrl = String(attachment?.url || "");
    const directImageUrl = isLikelyImageUrl(directUrl) ? directUrl : "";
    const imageUrl = imagePreviewUrl || directImageUrl;
    if (!imageUrl) return;
    setExpandedMedia({
      src: imageUrl,
      title: attachment?.fileName || "Image",
      subtitle: attachment?.contentType || "",
      openHref: "",
    });
  }

  function renderFavouriteMediaButton(draft) {
    const key = buildFavouriteMediaKey(draft?.sourceKind, draft?.sourceUrl);
    if (!key) return null;
    const favourite = favouriteMediaByKey.get(key) || null;
    const busy =
      !!favouriteMediaBusyById[key] ||
      (favourite?.id ? !!favouriteMediaBusyById[favourite.id] : false);

    return (
      <button
        type="button"
        className={`message-media-favourite-btn ${favourite ? "active" : ""}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFavouriteMedia(draft);
        }}
        disabled={busy}
        aria-pressed={!!favourite}
        title={favourite ? "Remove from favourites" : "Save to favourites"}
      >
        {favourite ? "★" : "☆"}
      </button>
    );
  }

  function renderMessageMediaInfo({
    title = "",
    subtitle = "",
    href = "",
    hrefLabel = "Open original",
    onAction = null,
    actionLabel = "Download",
  } = {}) {
    if (!title && !subtitle && !href && !onAction) return null;
    return (
      <details
        className="message-inline-media-details"
        onClick={(event) => event.stopPropagation()}
      >
        <summary>Info</summary>
        <div className="message-inline-media-details-body">
          {title && <strong>{title}</strong>}
          {subtitle && <p>{subtitle}</p>}
          {(href || onAction) && (
            <div className="message-inline-media-details-actions">
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {hrefLabel}
                </a>
              )}
              {onAction && (
                <button
                  type="button"
                  className="ghost"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onAction();
                  }}
                >
                  {actionLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    );
  }

  function formatInviteEstablishedDate(value) {
    if (!value) return "";
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return "";
      return parsed.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  function renderMessageLinkEmbedCard(embed, key) {
    const preview = getLinkPreviewForUrl(embed?.url);
    const inviteEmbed =
      embed?.kind === "opencom_invite" && embed?.invite?.code
        ? embed
        : preview?.kind === "opencom_invite" && preview?.invite?.code
          ? {
              url: preview.url || embed?.url || "",
              invite: preview.invite,
            }
          : null;

    if (inviteEmbed?.invite?.code) {
      const invite = inviteEmbed.invite;
      const joinUrl = inviteEmbed.url || buildInviteJoinUrl(invite.code);
      const onlineCount = Number(invite.onlineCount || 0);
      const memberCount = Number(invite.memberCount || 0);
      const established = formatInviteEstablishedDate(invite.serverCreatedAt);
      const serverName = invite.serverName || "Server";
      const iconSource = profileImageUrl(invite.serverLogoUrl || "");

      return (
        <div key={key} className="message-invite-embed">
          <div
            className="message-invite-hero"
            style={
              iconSource
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(12, 16, 27, 0.3), rgba(12, 16, 27, 0.95)), url(${iconSource})`,
                  }
                : undefined
            }
          />
          <div className="message-invite-body">
            <div className="message-invite-header">
              <div className="message-invite-icon">
                {iconSource ? (
                  <img src={iconSource} alt={serverName} />
                ) : (
                  <span>{getInitials(serverName)}</span>
                )}
              </div>
              <div className="message-invite-title-wrap">
                <strong>{serverName}</strong>
                <p className="message-invite-stats">
                  <span className="dot online" /> {onlineCount} Online
                  <span className="dot members" /> {memberCount} Members
                </p>
                {established && (
                  <p className="message-invite-established">
                    Est. {established}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              className="message-invite-cta"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                joinInvite(invite.code);
              }}
            >
              Go to Server
            </button>
            <a
              className="message-invite-link"
              href={joinUrl}
              target="_blank"
              rel="noreferrer"
            >
              {joinUrl}
            </a>
          </div>
        </div>
      );
    }

    const assetUrl = String(embed?.url || preview?.url || "").trim();
    const assetKind = getMediaAssetKind({
      url: assetUrl,
      contentType: "",
    });
    if (assetKind === "image" && assetUrl) {
      const favouriteDraft = buildFavouriteMediaDraftFromEmbed({
        ...embed,
        imageUrl: assetUrl,
      });
      return (
        <div
          key={key}
          className="message-media-card-wrap message-inline-asset-wrap"
          onContextMenu={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="message-inline-asset-image-button message-media-card-surface"
            onClick={() => openExpandedMediaFromEmbed(embed)}
            onKeyDown={(event) =>
              onMediaCardKeyDown(event, () => openExpandedMediaFromEmbed(embed))
            }
          >
            <img
              src={assetUrl}
              alt={embed.title || "Image"}
              loading="lazy"
              className="message-inline-asset-image"
            />
          </button>
          {renderFavouriteMediaButton(favouriteDraft)}
          {renderMessageMediaInfo({
            title: embed.title || guessFileNameFromUrl(assetUrl) || "Image",
            subtitle: embed.url || assetUrl,
            href: embed.url || assetUrl,
          })}
        </div>
      );
    }

    if (assetKind === "video" && assetUrl) {
      return (
        <div
          key={key}
          className="message-media-card-wrap message-inline-asset-wrap"
          onContextMenu={(event) => event.stopPropagation()}
        >
          <video
            className="message-inline-asset-video"
            src={assetUrl}
            controls
            playsInline
            preload="metadata"
            onClick={(event) => event.stopPropagation()}
          />
          {renderMessageMediaInfo({
            title: embed.title || guessFileNameFromUrl(assetUrl) || "Video",
            subtitle: embed.url || assetUrl,
            href: embed.url || assetUrl,
          })}
        </div>
      );
    }

    if (assetKind === "audio" && assetUrl) {
      return (
        <div
          key={key}
          className="message-media-card-wrap message-inline-asset-wrap"
          onContextMenu={(event) => event.stopPropagation()}
        >
          <audio
            className="message-inline-asset-audio"
            src={assetUrl}
            controls
            preload="metadata"
            onClick={(event) => event.stopPropagation()}
          />
          {renderMessageMediaInfo({
            title: embed.title || guessFileNameFromUrl(assetUrl) || "Audio",
            subtitle: embed.url || assetUrl,
            href: embed.url || assetUrl,
          })}
        </div>
      );
    }

    return (
      <a
        key={key}
        className="message-embed-card"
        href={embed.url}
        target="_blank"
        rel="noreferrer"
      >
        <strong>{embed.title || "Link"}</strong>
        {embed.description && <p>{embed.description}</p>}
        <p>{embed.url}</p>
        {embed.action?.label && <small>{embed.action.label}</small>}
      </a>
    );
  }

  function renderMessageAttachmentCard(attachment, key) {
    const previewUrl = attachmentPreviewUrlById[attachment?.id] || "";
    const directUrl = String(attachment?.url || "");
    const assetKind = getMediaAssetKind({
      url: directUrl,
      contentType: attachment?.contentType || "",
    });
    const mediaUrl = previewUrl || (assetKind ? directUrl : "");

    if (assetKind === "image" && mediaUrl) {
      const favouriteDraft = buildFavouriteMediaDraftFromAttachment(attachment);
      return (
        <div
          key={key}
          className="message-media-card-wrap message-inline-asset-wrap"
          title="Right-click image to save"
          onContextMenu={(event) => {
            // Keep native browser image context menu (Save image as...) instead of message menu.
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="message-inline-asset-image-button message-media-card-surface"
            onClick={() => openExpandedMediaFromAttachment(attachment)}
            onKeyDown={(event) =>
              onMediaCardKeyDown(event, () =>
                openExpandedMediaFromAttachment(attachment),
              )
            }
          >
            <img
              src={mediaUrl}
              alt={attachment?.fileName || "Image attachment"}
              loading="lazy"
              className="message-inline-asset-image"
            />
          </button>
          {renderFavouriteMediaButton(favouriteDraft)}
          {renderMessageMediaInfo({
            title: attachment?.fileName || "Image",
            subtitle: attachment?.contentType || "image",
            onAction: () => openMessageAttachment(attachment),
          })}
        </div>
      );
    }

    if (assetKind === "video" && mediaUrl) {
      return (
        <div
          key={key}
          className="message-media-card-wrap message-inline-asset-wrap"
          onContextMenu={(event) => event.stopPropagation()}
        >
          <video
            className="message-inline-asset-video"
            src={mediaUrl}
            controls
            playsInline
            preload="metadata"
            onClick={(event) => event.stopPropagation()}
          />
          {renderMessageMediaInfo({
            title: attachment?.fileName || "Video",
            subtitle: attachment?.contentType || "video",
            onAction: () => openMessageAttachment(attachment),
          })}
        </div>
      );
    }

    if (assetKind === "audio" && mediaUrl) {
      return (
        <div
          key={key}
          className="message-media-card-wrap message-inline-asset-wrap"
          onContextMenu={(event) => event.stopPropagation()}
        >
          <audio
            className="message-inline-asset-audio"
            src={mediaUrl}
            controls
            preload="metadata"
            onClick={(event) => event.stopPropagation()}
          />
          {renderMessageMediaInfo({
            title: attachment?.fileName || "Audio",
            subtitle: attachment?.contentType || "audio",
            onAction: () => openMessageAttachment(attachment),
          })}
        </div>
      );
    }

    return (
      <button
        key={key}
        type="button"
        className="message-embed-card message-embed-card-btn"
        onClick={(event) => {
          event.stopPropagation();
          openMessageAttachment(attachment);
        }}
      >
        <strong>{attachment?.fileName || "Attachment"}</strong>
        <p>{attachment?.contentType || "file"}</p>
      </button>
    );
  }

  function formatAccountCreated(createdAt) {
    if (!createdAt) return null;
    try {
      const d = new Date(createdAt);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return null;
    }
  }

  async function onUploadTheme(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setThemeCss(await file.text());
    setStatus(`Theme loaded: ${file.name}`);
  }

  function logout() {
    cleanupVoiceRtc().catch(() => {});
    setAccessToken("");
    setRefreshToken("");
    setServers([]);
    setGuildState(null);
    setMessages([]);
    setSettingsOpen(false);
    setStatus("Logged out.");
  }

  function openAppEntryRoute() {
    navigateAppRoute(accessToken ? APP_ROUTE_CLIENT : APP_ROUTE_LOGIN);
  }

  function openBlogsRoute() {
    navigateAppRoute(APP_ROUTE_BLOGS);
  }

  function openBlogPostRoute(slug) {
    if (!slug) return;
    navigateAppRoute(`${APP_ROUTE_BLOGS}/${slug}`);
  }

  function openPreferredDesktopDownload() {
    const href = preferredDownloadTarget?.href || DOWNLOAD_TARGETS[0]?.href;
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function openThemeStudio(tab = "catalog", { closeSettings = false } = {}) {
    setThemeStudioTab(tab === "creator" ? "creator" : "catalog");
    setNavMode("themes");
    if (closeSettings) setSettingsOpen(false);
  }

  function openServerAdmin(
    serverId = "",
    {
      closeSettings = false,
      closeAddServer = false,
      tab = "overview",
      guildId = "",
      channelId = "",
      channelAction = "",
    } = {},
  ) {
    const targetServerId = serverId || activeServerId || "";
    if (targetServerId) {
      setActiveServerId(targetServerId);
      if (targetServerId !== activeServerId) {
        setActiveGuildId("");
        setGuildState(null);
        setMessages([]);
      }
    }
    setServerAdminIntent((current) => ({
      nonce: current.nonce + 1,
      serverId: targetServerId,
      guildId,
      tab,
      channelId,
      channelAction,
    }));
    setNavMode("server-admin");
    if (closeSettings) setSettingsOpen(false);
    if (closeAddServer) setAddServerModalOpen(false);
  }

  if (routePath === APP_ROUTE_PANEL) {
    if (typeof window !== "undefined") {
      window.location.replace(PANEL_APP_URL);
    }
    return null;
  }

  if (routePath === APP_ROUTE_BLOGS) {
    return (
      <BlogsPage
        coreApi={CORE_API}
        onOpenHome={() => navigateAppRoute(APP_ROUTE_HOME)}
        onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
        onOpenApp={openAppEntryRoute}
        onOpenPost={openBlogPostRoute}
      />
    );
  }

  if (isBlogPostPath(routePath)) {
    return (
      <BlogPostPage
        coreApi={CORE_API}
        slug={getBlogSlugFromPath(routePath)}
        onOpenHome={() => navigateAppRoute(APP_ROUTE_HOME)}
        onOpenBlogs={openBlogsRoute}
        onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
        onOpenApp={openAppEntryRoute}
      />
    );
  }

  if (routePath === APP_ROUTE_TERMS) {
    return (
      <TermsPage
        onBack={() =>
          navigateAppRoute(accessToken ? APP_ROUTE_CLIENT : APP_ROUTE_HOME)
        }
      />
    );
  }

  if (routePath === APP_ROUTE_HOME) {
    return (
      <LandingPage
        downloadMenuRef={downloadMenuRef}
        downloadsMenuOpen={downloadsMenuOpen}
        setDownloadsMenuOpen={setDownloadsMenuOpen}
        downloadTargets={DOWNLOAD_TARGETS}
        preferredDownloadTarget={preferredDownloadTarget}
        mobileDownloadTarget={mobileDownloadTarget}
        isMobileVisitor={isMobileVisitor}
        isAndroidVisitor={isAndroidVisitor}
        onOpenApp={openAppEntryRoute}
        onOpenClient={openAppEntryRoute}
        onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
        onOpenBlogs={openBlogsRoute}
      />
    );
  }

  if (!accessToken) {
    return (
      <AuthShell
        authMode={authMode}
        setAuthMode={setAuthMode}
        email={email}
        setEmail={setEmail}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        authResetPasswordConfirm={authResetPasswordConfirm}
        setAuthResetPasswordConfirm={setAuthResetPasswordConfirm}
        pendingVerificationEmail={pendingVerificationEmail}
        resetPasswordToken={resetPasswordToken}
        status={status}
        onSubmit={handleAuthSubmit}
        onResendVerification={handleResendVerification}
        onBackHome={() => navigateAppRoute(APP_ROUTE_HOME)}
        onOpenTerms={() => navigateAppRoute(APP_ROUTE_TERMS)}
      />
    );
  }

  const socialSidebarTitle =
    navMode === "profile"
      ? "Profile Studio"
      : navMode === "themes"
        ? "Theme Studio"
      : navMode === "server-admin"
        ? "Server Admin"
      : navMode === "dms"
        ? "Messages"
        : "Friends";
  const socialSidebarSubtitle =
    navMode === "profile"
      ? "Build your profile and creator identity."
      : navMode === "themes"
        ? "Catalogue, creator, and live interface styling."
      : navMode === "server-admin"
        ? "Manage servers, permissions, roles, channels, and extensions inline."
      : "Your social hub, DMs, and creator tools.";
  const ownDisplayName =
    profile?.displayName || profile?.username || me?.username || "You";
  const ownSecondaryLabel = getSocialSecondaryLabel(
    {
      displayName: profile?.displayName || "",
      username: me?.username || profile?.username || "",
      name: me?.username || profile?.username || "",
    },
    me?.id,
    {
      fallback: profile?.platformTitle || "OpenCom Member",
      maxLength: 52,
    },
  );
  const ownCompactSecondaryLabel = getSocialSecondaryLabel(
    {
      displayName: profile?.displayName || "",
      username: me?.username || profile?.username || "",
      name: me?.username || profile?.username || "",
    },
    me?.id,
    {
      fallback: profile?.platformTitle || "OpenCom Member",
      // The bottom-left account rail is much tighter than the main profile card,
      // so clamp the status segment much earlier to avoid layout spill.
      maxLength: 24,
    },
  );

  return (
    <div className="opencom-shell">
      <ServerRailNav
        dmNotification={dmNotification}
        dms={dms}
        setNavMode={setNavMode}
        setActiveDmId={setActiveDmId}
        setDmNotification={setDmNotification}
        profileImageUrl={profileImageUrl}
        getInitials={getInitials}
        navMode={navMode}
        servers={servers}
        activeServerId={activeServerId}
        setActiveServerId={setActiveServerId}
        setActiveGuildId={setActiveGuildId}
        setGuildState={setGuildState}
        setMessages={setMessages}
        openServerContextMenu={openServerContextMenu}
        serverPingCounts={serverPingCounts}
        setAddServerModalOpen={setAddServerModalOpen}
      />

      <aside
        className={`channel-sidebar ${isInVoiceChannel ? "voice-connected" : ""}`}
      >
        <header
          className="sidebar-header"
          style={
            activeServer?.bannerUrl
              ? {
                  backgroundImage: `linear-gradient(rgba(10,16,30,0.72), rgba(10,16,30,0.86)), url(${profileImageUrl(activeServer.bannerUrl)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <h2>
            {navMode === "servers"
              ? activeServer?.name || "No server"
              : socialSidebarTitle}
          </h2>
          <small>
            {navMode === "servers"
              ? activeGuild?.name || "Choose a channel"
              : socialSidebarSubtitle}
          </small>
        </header>

        {navMode === "servers" && (
          <>
            <section className="sidebar-block channels-container">
              {groupedChannelSections.map(({ category, channels: items }) => {
                const isCollapsed = collapsedCategories[category.id];
                return (
                  <div className="category-block" key={category.id}>
                    <div className="category-header-row">
                      <button
                        className={`category-header ${categoryDragId === category.id ? "channel-dragging" : ""}`}
                        draggable={
                          canManageServer && category.id !== "uncategorized"
                        }
                        onDragStart={() =>
                          canManageServer &&
                          category.id !== "uncategorized" &&
                          setCategoryDragId(category.id)
                        }
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (category.id !== "uncategorized")
                            e.currentTarget.classList.add(
                              "channel-drop-target",
                            );
                        }}
                        onDragLeave={(e) =>
                          e.currentTarget.classList.remove(
                            "channel-drop-target",
                          )
                        }
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove(
                            "channel-drop-target",
                          );
                          if (
                            canManageServer &&
                            categoryDragId &&
                            category.id !== "uncategorized" &&
                            categoryDragId !== category.id
                          ) {
                            handleCategoryDrop(categoryDragId, category.id);
                          }
                        }}
                        onDragEnd={() => setCategoryDragId(null)}
                        onClick={() => toggleCategory(category.id)}
                        onContextMenu={(event) =>
                          category.id !== "uncategorized" &&
                          canManageServer &&
                          openCategoryContextMenu(event, category)
                        }
                      >
                        <span className="chevron">
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        {category.name}
                      </button>
                      {canManageServer && category.id !== "uncategorized" && (
                        <div className="category-actions">
                          <button
                            type="button"
                            className="channel-action-btn"
                            title="Create channel in category"
                            onClick={(event) => {
                              event.stopPropagation();
                              promptCreateChannelFlow({
                                fixedType: "text",
                                fixedParentId: category.id,
                              });
                            }}
                          >
                            ＋
                          </button>
                          <button
                            type="button"
                            className="channel-action-btn"
                            title="Category settings"
                            onClick={(event) => {
                              event.stopPropagation();
                              openChannelSettings(category);
                            }}
                          >
                            ⚙
                          </button>
                        </div>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="category-items">
                        {items.map((channel) => (
                          <div key={channel.id}>
                            <div className="channel-row-wrap">
                              <button
                                className={`channel-row ${channel.id === activeChannelId ? "active" : ""} ${channelDragId === channel.id ? "channel-dragging" : ""}`}
                                draggable={canManageServer}
                                onDragStart={() =>
                                  canManageServer &&
                                  setChannelDragId(channel.id)
                                }
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.add(
                                    "channel-drop-target",
                                  );
                                }}
                                onDragLeave={(e) =>
                                  e.currentTarget.classList.remove(
                                    "channel-drop-target",
                                  )
                                }
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.remove(
                                    "channel-drop-target",
                                  );
                                  if (
                                    canManageServer &&
                                    channelDragId &&
                                    channelDragId !== channel.id
                                  )
                                    handleChannelDrop(
                                      channelDragId,
                                      channel.id,
                                      items,
                                    );
                                }}
                                onDragEnd={() => setChannelDragId(null)}
                                onContextMenu={(event) =>
                                  canManageServer &&
                                  openChannelContextMenu(event, channel)
                                }
                                onClick={() => {
                                  if (channel.type === "text") {
                                    setActiveChannelId(channel.id);
                                    return;
                                  }
                                  if (channel.type === "voice")
                                    joinVoiceChannel(channel);
                                }}
                              >
                                <span className="channel-hash">
                                  {channel.type === "voice" ? "🔊" : "#"}
                                </span>
                                <span
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    minWidth: 0,
                                  }}
                                >
                                  <span>{channel.name}</span>
                                  {channel.type === "voice" &&
                                    (voiceMembersByChannel.get(channel.id)
                                      ?.length || 0) > 0 && (
                                      <span
                                        className="hint"
                                        style={{ fontSize: "11px" }}
                                      >
                                        {
                                          voiceMembersByChannel.get(channel.id)
                                            .length
                                        }{" "}
                                        connected
                                      </span>
                                    )}
                                </span>
                              </button>
                              {canManageServer && (
                                <button
                                  type="button"
                                  className="channel-action-btn channel-row-cog"
                                  title="Channel settings"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openChannelSettings(channel);
                                  }}
                                >
                                  ⚙
                                </button>
                              )}
                            </div>
                            {channel.type === "voice" &&
                              (voiceMembersByChannel.get(channel.id)?.length ||
                                0) > 0 && (
                                <div className="voice-channel-members">
                                  {voiceMembersByChannel
                                    .get(channel.id)
                                    .map((member) => {
                                      const speaking =
                                        !!voiceSpeakingByGuild[activeGuildId]?.[
                                          member.userId
                                        ];
                                      return (
                                        <div
                                          key={`${channel.id}-${member.userId}`}
                                          className="voice-channel-member-row"
                                          onContextMenu={(event) =>
                                            openMemberContextMenu(event, member)
                                          }
                                        >
                                          <div className="voice-channel-member-main">
                                            <SafeAvatar
                                              src={profileImageUrl(
                                                member.pfp_url,
                                              )}
                                              alt={member.username}
                                              name={member.username}
                                              seed={member.userId}
                                              className={`avatar member-avatar vc-avatar ${speaking ? "speaking" : ""}`}
                                              imgClassName="avatar-image"
                                            />
                                            <span className="voice-channel-member-name">
                                              {member.username}
                                            </span>
                                            <span className="voice-channel-member-icons">
                                              {member.deafened ? (
                                                <HeadphonesIcon
                                                  deafened
                                                  size={14}
                                                  title="Deafened"
                                                />
                                              ) : (
                                                <MicrophoneIcon
                                                  muted={member.muted}
                                                  size={14}
                                                  title={
                                                    member.muted
                                                      ? "Muted"
                                                      : "Microphone active"
                                                  }
                                                />
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {!groupedChannelSections.length && (
                <p className="hint">
                  No channels available. Create one in Settings.
                </p>
              )}
            </section>
          </>
        )}

        {navMode !== "servers" && (
          <section className="sidebar-block channels-container social-sidebar-shell">
            <div className="social-hub-menu" role="navigation" aria-label="OpenCom home">
              <button
                type="button"
                className={`social-hub-link ${navMode === "friends" ? "active" : ""}`}
                onClick={() => setNavMode("friends")}
              >
                <span className="social-hub-link-icon" aria-hidden="true">
                  👥
                </span>
                <span className="social-hub-link-copy">
                  <strong>Friends</strong>
                  <small>Presence, activity, and who is around.</small>
                </span>
              </button>
              <button
                type="button"
                className={`social-hub-link ${navMode === "dms" ? "active" : ""}`}
                onClick={() => {
                  if (!activeDmId && dms[0]?.id) setActiveDmId(dms[0].id);
                  setNavMode("dms");
                }}
              >
                <span className="social-hub-link-icon" aria-hidden="true">
                  💬
                </span>
                <span className="social-hub-link-copy">
                  <strong>Messages</strong>
                  <small>Jump into direct conversations fast.</small>
                </span>
              </button>
              <button
                type="button"
                className={`social-hub-link ${navMode === "profile" ? "active" : ""}`}
                onClick={() => setNavMode("profile")}
              >
                <span className="social-hub-link-icon" aria-hidden="true">
                  🪪
                </span>
                <span className="social-hub-link-copy">
                  <strong>Profile Creator</strong>
                  <small>Design your profile card and layout.</small>
                </span>
              </button>
              <button
                type="button"
                className={`social-hub-link ${navMode === "themes" ? "active" : ""}`}
                onClick={() => openThemeStudio("catalog")}
              >
                <span className="social-hub-link-icon" aria-hidden="true">
                  🎨
                </span>
                <span className="social-hub-link-copy">
                  <strong>Themes</strong>
                  <small>Browse the catalogue or build one inline.</small>
                </span>
              </button>
              {canAccessServerAdminPanel && (
                <button
                  type="button"
                  className={`social-hub-link ${navMode === "server-admin" ? "active" : ""}`}
                  onClick={() => openServerAdmin(activeServerId)}
                >
                  <span className="social-hub-link-icon" aria-hidden="true">
                    🛠️
                  </span>
                  <span className="social-hub-link-copy">
                    <strong>Server Admin</strong>
                    <small>Manage channels, roles, invites, and extensions inline.</small>
                  </span>
                </button>
              )}
            </div>

            {profile && (
              <button
                type="button"
                className={`profile-preview social-profile-preview ${navMode === "profile" ? "active" : ""}`}
                onClick={() => setNavMode("profile")}
                style={{
                  backgroundImage: profile?.bannerUrl
                    ? `linear-gradient(rgba(10,16,30,0.45), rgba(10,16,30,0.88)), url(${profileImageUrl(profile.bannerUrl)})`
                    : undefined,
                }}
              >
                <div className="social-profile-top">
                  <SafeAvatar
                    src={profileImageUrl(profile.pfpUrl)}
                    alt={ownDisplayName}
                    name={ownDisplayName}
                    seed={me?.id || ownDisplayName}
                    className="avatar social-profile-avatar"
                    imgClassName="avatar-image"
                  />
                  <div className="social-profile-copy">
                    <strong>{ownDisplayName}</strong>
                    <span>@{me?.username || profile.username}</span>
                    <small title={ownSecondaryLabel}>{ownSecondaryLabel}</small>
                  </div>
                </div>
              </button>
            )}

            <div className="social-sidebar-section-head">
              <span>Direct messages</span>
              <button
                type="button"
                className="ghost social-sidebar-head-action"
                onClick={() => {
                  if (!activeDmId && dms[0]?.id) setActiveDmId(dms[0].id);
                  setNavMode("dms");
                }}
              >
                Open
              </button>
            </div>

            <div className="social-dm-list">
              {dms.map((dm) => {
                const dmUserId = dm.participantId || dm.id;
                const dmPrimaryLabel = getSocialPrimaryName(dm, dm.name || "Message");
                const dmSecondaryLabel = dm.isNoReply
                  ? "Official updates only"
                  : getSocialSecondaryLabel(
                      {
                        displayName: dm.displayName || "",
                        username: dm.username || dm.name || "",
                        name: dm.name || dm.username || "",
                      },
                      dmUserId,
                      {
                        fallback: "Available for chat",
                        maxLength: 52,
                      },
                    );
                return (
                  <button
                    key={dm.id}
                    className={`channel-row dm-sidebar-row ${navMode === "dms" && dm.id === activeDmId ? "active" : ""}`}
                    onClick={() => {
                      setActiveDmId(dm.id);
                      setNavMode("dms");
                    }}
                    title={`DM ${dmPrimaryLabel}`}
                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    {renderPresenceAvatar({
                      userId: dmUserId,
                      username: dmPrimaryLabel,
                      pfpUrl: dm.pfp_url,
                      size: 30,
                    })}
                    <div className="dm-sidebar-meta">
                      <div className="dm-sidebar-name-row">
                        <span className="dm-sidebar-name">{dmPrimaryLabel}</span>
                        {renderOfficialBadge(
                          dm.badgeDetails,
                          "official-badge--compact",
                        )}
                      </div>
                      <small
                        className="dm-sidebar-note"
                        title={dmSecondaryLabel}
                      >
                        {dmSecondaryLabel}
                      </small>
                    </div>
                  </button>
                );
              })}
            </div>
            {!dms.length && (
              <p className="hint">
                Add friends to open direct message threads.
              </p>
            )}
          </section>
        )}

        <footer className="self-card">
          {isInVoiceChannel && (
            <div className="voice-widget">
              <div className="voice-top">
                <strong>Voice Connected</strong>
                <span title={voiceConnectedChannelName}>
                  {voiceConnectedChannelName}
                </span>
              </div>
              <div className="voice-actions voice-actions-modern">
                <button
                  className={`voice-action-pill ${isMuted ? "active danger" : ""}`}
                  title={isMuted ? "Unmute" : "Mute"}
                  onClick={() => setIsMuted((value) => !value)}
                >
                  <MicrophoneIcon
                    muted={isMuted}
                    size={17}
                    title={isMuted ? "Unmute" : "Mute"}
                  />
                </button>
                <button
                  className={`voice-action-pill ${isDeafened ? "active danger" : ""}`}
                  title={isDeafened ? "Undeafen" : "Deafen"}
                  onClick={() => setIsDeafened((value) => !value)}
                >
                  <HeadphonesIcon
                    deafened={isDeafened}
                    size={17}
                    title={isDeafened ? "Undeafen" : "Deafen"}
                  />
                </button>
                <button
                  className={`voice-action-pill ${isCameraEnabled ? "active" : ""}`}
                  title={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
                  onClick={toggleCamera}
                >
                  {isCameraEnabled ? "📷" : "📸"}
                </button>
                <button
                  className={`voice-action-pill ${isScreenSharing ? "active" : ""}`}
                  title={
                    isScreenSharing ? "Stop screen share" : "Start screen share"
                  }
                  onClick={toggleScreenShare}
                >
                  {isScreenSharing ? "🖥️" : "📺"}
                </button>
                <button
                  className="voice-action-pill danger"
                  title="Disconnect from voice"
                  onClick={leaveVoiceChannel}
                  disabled={isDisconnectingVoice}
                >
                  {isDisconnectingVoice ? "…" : "📞"}
                </button>
                <button
                  className="voice-action-pill"
                  title="Voice settings"
                  onClick={() => {
                    setSettingsOpen(true);
                    setSettingsTab("voice");
                  }}
                >
                  ⚙️
                </button>
              </div>
              <div className="voice-widget-summary">
                <div>
                  <strong>
                    {remoteScreenShares.length
                      ? `${remoteScreenShares.length} live ${
                          remoteScreenShares.length === 1 ? "share" : "shares"
                        }`
                      : liveCameraCount
                        ? `${liveCameraCount} camera${liveCameraCount === 1 ? "" : "s"} live`
                      : activePrivateCall?.callId
                        ? "Private call live"
                        : "Voice room live"}
                  </strong>
                  <span>
                    {activePrivateCall?.callId
                      ? "Open the call stage to switch screens, watch cameras, or go fullscreen."
                      : "Jump back into the full call view for screens and cameras anytime."}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    void openCurrentCallView();
                  }}
                >
                  View call
                </button>
              </div>
            </div>
          )}

          <div className="user-row">
            {renderPresenceAvatar({
              userId: me?.id,
              username: ownDisplayName,
              pfpUrl: profile?.pfpUrl,
              size: 36,
            })}
            <div className="user-meta">
              <strong>{ownDisplayName}</strong>
              <span title={ownSecondaryLabel}>{ownCompactSecondaryLabel}</span>
            </div>
            <select
              className="status-select"
              value={selfStatus}
              onChange={(event) => setSelfStatus(event.target.value)}
              title="Your status"
            >
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do Not Disturb</option>
              <option value="invisible">Invisible</option>
            </select>
            <div className="user-controls">
              <button
                className={`icon-btn ${isMuted ? "danger" : "ghost"}`}
                onClick={() => setIsMuted((value) => !value)}
                title={isMuted ? "Unmute" : "Mute"}
              >
                <MicrophoneIcon muted={isMuted} size={18} />
              </button>
              <button
                className={`icon-btn ${isDeafened ? "danger" : "ghost"}`}
                onClick={() => setIsDeafened((value) => !value)}
                title={isDeafened ? "Undeafen" : "Deafen"}
              >
                <HeadphonesIcon deafened={isDeafened} size={18} />
              </button>
              <button
                className="icon-btn ghost"
                onClick={() => {
                  setSettingsOpen(true);
                  setSettingsTab("profile");
                }}
              >
                ⚙️
              </button>
            </div>
          </div>
        </footer>
      </aside>

      <main className="chat-pane">
        {navMode === "servers" && servers.length === 0 && (
          <div
            className="create-server-empty"
            style={{ padding: "2rem", maxWidth: "420px", margin: "auto" }}
          >
            <h3 style={{ marginBottom: "0.5rem" }}>Create your server</h3>
            <p className="hint" style={{ marginBottom: "1rem" }}>
              You get one server hosted by us. Name it and start customising
              channels and roles.
            </p>
            <input
              type="text"
              value={newOfficialServerName}
              onChange={(e) => setNewOfficialServerName(e.target.value)}
              placeholder="Server name"
              style={{
                width: "100%",
                marginBottom: "0.75rem",
                padding: "0.5rem",
              }}
            />
            <input
              type="text"
              value={newOfficialServerLogoUrl}
              onChange={(e) => setNewOfficialServerLogoUrl(e.target.value)}
              placeholder="Logo URL (.png/.jpg/.webp/.svg)"
              style={{
                width: "100%",
                marginBottom: "0.75rem",
                padding: "0.5rem",
              }}
            />
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              Upload Logo
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  onImageFieldUpload(
                    event,
                    "server logo",
                    setNewOfficialServerLogoUrl,
                  )
                }
                style={{ width: "100%", marginTop: "0.35rem" }}
              />
            </label>
            <input
              type="text"
              value={newOfficialServerBannerUrl}
              onChange={(e) => setNewOfficialServerBannerUrl(e.target.value)}
              placeholder="Banner URL (optional)"
              style={{
                width: "100%",
                marginBottom: "0.75rem",
                padding: "0.5rem",
              }}
            />
            <label style={{ display: "block", marginBottom: "0.75rem" }}>
              Upload Banner
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  onImageFieldUpload(
                    event,
                    "server banner",
                    setNewOfficialServerBannerUrl,
                  )
                }
                style={{ width: "100%", marginTop: "0.35rem" }}
              />
            </label>
            <button
              onClick={createOfficialServer}
              disabled={
                !newOfficialServerName.trim() ||
                !newOfficialServerLogoUrl.trim()
              }
            >
              Create your server
            </button>
          </div>
        )}
        {navMode === "servers" && servers.length > 0 && (
          <div className={`chat-layout ${showServerVoiceStage ? "chat-layout-voice" : ""}`}>
            <section
              className={`chat-main ${showServerVoiceStage ? "chat-main-voice-stage" : ""}`}
            >
              <header className="chat-header">
                <h3>
                  <span className="channel-hash">
                    {activeChannel?.type === "voice" ? "🔊" : "#"}
                  </span>{" "}
                  {activeChannel?.name || "updates"}
                </h3>
                <div className="chat-actions">
                  {showServerVoiceStage ? (
                    <>
                      {isViewingConnectedServerVoice ? (
                        <>
                          <button
                            className="icon-btn ghost"
                            title={
                              isCameraEnabled
                                ? "Turn camera off"
                                : "Turn camera on"
                            }
                            onClick={toggleCamera}
                          >
                            {isCameraEnabled ? "📷" : "📸"}
                          </button>
                          <button
                            className="icon-btn ghost"
                            title={
                              isScreenSharing
                                ? "Stop screen share"
                                : "Start screen share"
                            }
                            onClick={toggleScreenShare}
                          >
                            {isScreenSharing ? "🖥️" : "📺"}
                          </button>
                        </>
                      ) : null}
                      <button
                        className="ghost"
                        onClick={() => {
                          setSettingsOpen(true);
                          setSettingsTab("voice");
                        }}
                      >
                        Voice settings
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-btn ghost"
                        title="Pinned messages"
                        onClick={() => setShowPinned((value) => !value)}
                      >
                        📌
                      </button>
                      <button className="icon-btn ghost" title="Threads">
                        🧵
                      </button>
                      <button className="icon-btn ghost" title="Notifications">
                        🔔
                      </button>
                      <button className="icon-btn ghost" title="Members">
                        👥
                      </button>
                      <input
                        className="search-input"
                        placeholder={`Search ${activeServer?.name || "server"}`}
                      />
                      <button
                        className="ghost"
                        onClick={() => {
                          setSettingsOpen(true);
                          setSettingsTab("server");
                        }}
                      >
                        Open settings
                      </button>
                    </>
                  )}
                </div>
              </header>

              {showServerVoiceStage ? (
                <VoiceCallStage
                  title={activeChannel?.name || "Voice room"}
                  subtitle={
                    isViewingConnectedServerVoice
                      ? `Connected to ${activeServer?.name || "this server"}`
                      : `Preview the room before you join ${activeServer?.name || "the server"}`
                  }
                  participants={activeVoiceStageParticipants}
                  remoteScreenShares={
                    isViewingConnectedServerVoice ? enrichedRemoteScreenShares : []
                  }
                  selectedRemoteScreenShare={
                    isViewingConnectedServerVoice ? selectedRemoteScreenShare : null
                  }
                  onSelectScreenShare={selectScreenShare}
                  isConnected={!!isViewingConnectedServerVoice}
                  isMuted={isMuted}
                  isDeafened={isDeafened}
                  isCameraEnabled={isCameraEnabled}
                  isScreenSharing={isScreenSharing}
                  liveCameraCount={liveCameraCount}
                  onToggleMute={() => setIsMuted((value) => !value)}
                  onToggleDeafen={() => setIsDeafened((value) => !value)}
                  onToggleCamera={toggleCamera}
                  onToggleScreenShare={toggleScreenShare}
                  onJoin={() => joinVoiceChannel(activeChannel)}
                  onLeave={leaveVoiceChannel}
                  joinLabel="Join this room"
                  leaveLabel="Leave room"
                  emptyTitle={
                    isViewingConnectedServerVoice
                      ? "No one is sharing yet"
                      : "Jump into the room"
                  }
                  emptyDescription={
                    isViewingConnectedServerVoice
                      ? "Everyone in the voice room appears here, with live cameras and screen shares ready to focus fullscreen."
                      : "Join this voice room to hear the call, watch live cameras and shares, and pop them fullscreen."
                  }
                />
              ) : (
                <>
              {showPinned && activePinnedServerMessages.length > 0 && (
                <div className="pinned-strip">
                  {activePinnedServerMessages.slice(0, 3).map((item) => (
                    <div key={item.id} className="pinned-item">
                      <strong>{item.author}</strong>
                      <span>{item.content}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="messages" ref={messagesRef}>
                {(() => {
                  let lastDayKey = "";
                  return groupedServerMessages.map((group) => {
                    const member = resolvedMemberList.find(
                      (m) => m.id === group.authorId,
                    );
                    const roles = (guildState?.roles || [])
                      .filter((r) => (member?.roleIds || []).includes(r.id))
                      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
                    const topRole = roles[0];
                    const roleColor =
                      topRole?.color != null && topRole.color !== ""
                        ? typeof topRole.color === "number"
                          ? `#${Number(topRole.color).toString(16).padStart(6, "0")}`
                          : topRole.color
                        : null;
                    const groupDayKey = getMessageDayKey(
                      group.firstMessageTime,
                    );
                    const showDateDivider =
                      !!groupDayKey && groupDayKey !== lastDayKey;
                    if (groupDayKey) lastDayKey = groupDayKey;

                    return (
                      <div key={`group-wrap-${group.id}`}>
                        {showDateDivider && (
                          <div className="message-date-divider">
                            <span>
                              {formatMessageDate(group.firstMessageTime)}
                            </span>
                          </div>
                        )}
                        <article className="msg grouped-msg">
                          <SafeAvatar
                            src={profileImageUrl(group.pfpUrl)}
                            alt={group.author}
                            name={group.author || "User"}
                            seed={group.authorId}
                            className="msg-avatar"
                            maxLetters={2}
                          />
                          <div className="msg-body">
                            <strong className="msg-author">
                              <button
                                className="name-btn"
                                style={
                                  roleColor ? { color: roleColor } : undefined
                                }
                                onClick={(event) =>
                                  openMemberProfile(
                                    {
                                      id: group.authorId,
                                      username: group.author,
                                      status: getPresence(group.authorId),
                                      pfp_url: group.pfpUrl,
                                    },
                                    { x: event.clientX, y: event.clientY },
                                  )
                                }
                                onContextMenu={(event) =>
                                  openMemberContextMenu(event, {
                                    id: group.authorId,
                                    username: group.author,
                                    pfp_url: group.pfpUrl,
                                    roleIds: member?.roleIds || [],
                                  })
                                }
                              >
                                {group.author}
                              </button>
                              {topRole && (
                                <span className="msg-role-tag">
                                  {topRole.name}
                                </span>
                              )}
                              <span className="msg-time">
                                {formatMessageTime(group.firstMessageTime)}
                              </span>
                            </strong>
                            {group.messages.map((message) => {
                              const derivedLinkEmbeds =
                                getDerivedLinkEmbeds(message);
                              const hideMessageContent =
                                isAssetOnlyMessageContent(message);
                              const isPinnedMessage =
                                activePinnedServerMessages.some(
                                  (item) => item.id === message.id,
                                );
                              return (
                                <div
                                  key={message.id}
                                  className="message-entry"
                                  onContextMenu={(event) =>
                                    openMessageContextMenu(event, {
                                      id: message.id,
                                      kind: "server",
                                      authorId:
                                        message.author_id || message.authorId,
                                      author: group.author,
                                      authorUsername:
                                        message.authorUsername ||
                                        group.author,
                                      content: message.content,
                                      createdAt:
                                        message.created_at ||
                                        message.createdAt ||
                                        "",
                                      attachments: message.attachments || [],
                                      mine:
                                        (message.author_id ||
                                          message.authorId) === me?.id,
                                    })
                                  }
                                >
                                  {(!hideMessageContent || isPinnedMessage) && (
                                    <div className="message-content-wrap">
                                      {isPinnedMessage && (
                                        <span className="message-pin-prefix">
                                          📌 Pinned
                                        </span>
                                      )}
                                      {!hideMessageContent &&
                                        renderContentWithMentions(message)}
                                    </div>
                                  )}
                                  {Array.isArray(message?.embeds) &&
                                    message.embeds.length > 0 && (
                                      <div className="message-embeds">
                                        {message.embeds.map((embed, index) => (
                                          <div
                                            key={`${message.id}-embed-${index}`}
                                            className="message-embed-card"
                                          >
                                            {embed.title && (
                                              <strong>{embed.title}</strong>
                                            )}
                                            {embed.description && (
                                              <p>{embed.description}</p>
                                            )}
                                            {embed.url && (
                                              <a
                                                href={embed.url}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                {embed.url}
                                              </a>
                                            )}
                                            {embed.footer?.text && (
                                              <small>{embed.footer.text}</small>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  {Array.isArray(message?.linkEmbeds) &&
                                    message.linkEmbeds.length > 0 && (
                                      <div className="message-embeds">
                                        {message.linkEmbeds.map(
                                          (embed, index) =>
                                            renderMessageLinkEmbedCard(
                                              embed,
                                              `${message.id}-link-${index}`,
                                            ),
                                        )}
                                      </div>
                                    )}
                                  {derivedLinkEmbeds.length > 0 && (
                                    <div className="message-embeds">
                                      {derivedLinkEmbeds.map((embed, index) =>
                                        renderMessageLinkEmbedCard(
                                          embed,
                                          `${message.id}-derived-link-${index}`,
                                        ),
                                      )}
                                    </div>
                                  )}
                                  {Array.isArray(message?.attachments) &&
                                    message.attachments.length > 0 && (
                                      <div className="message-embeds">
                                        {message.attachments.map(
                                          (attachment, index) =>
                                            renderMessageAttachmentCard(
                                              attachment,
                                              `${message.id}-att-${index}`,
                                          ),
                                        )}
                                      </div>
                                    )}
                                  {renderMessageReactions(message, "server")}
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      </div>
                    );
                  });
                })()}
                {!messages.length && (
                  <p className="empty">
                    No messages yet. Start the conversation.
                  </p>
                )}
              </div>

              {replyTarget && (
                <div className="reply-banner">
                  <span>Replying to {replyTarget.author}</span>
                  <button
                    className="ghost"
                    onClick={() => setReplyTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <footer
                className="composer server-composer"
                onClick={() => composerInputRef.current?.focus()}
              >
                <button
                  className="ghost composer-icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    attachmentInputRef.current?.click();
                  }}
                >
                  ＋
                </button>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={async (event) => {
                    const files = Array.from(event.target.files || []);
                    await uploadAttachments(files, "file picker");
                  }}
                />
                <div className="composer-input-wrap">
                  {pendingAttachments.length > 0 && (
                    <div className="mention-suggestions">
                      {pendingAttachments.map((attachment, index) => (
                        <div
                          key={`pending-att-${index}`}
                          className="mention-suggestion"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            width: "100%",
                          }}
                        >
                          <span>{attachment.fileName || "attachment"}</span>
                          <button
                            type="button"
                            className="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPendingAttachments((current) =>
                                current.filter((_, i) => i !== index),
                              );
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={composerInputRef}
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onPaste={(event) => {
                      const files = extractFilesFromClipboardData(
                        event.clipboardData,
                      );
                      if (!files.length) return;
                      event.preventDefault();
                      uploadAttachments(files, "clipboard").catch(() => {});
                    }}
                    placeholder={`Message #${activeChannel?.name || "channel"}`}
                    title="Enter to send, Shift+Enter for a new line"
                    onKeyDown={(event) => {
                      if (
                        !showingSlash &&
                        showingEmoteSuggestions &&
                        event.key === "ArrowDown" &&
                        emoteSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        setEmoteSelectionIndex(
                          (current) =>
                            (current + 1) % emoteSuggestions.length,
                        );
                        return;
                      }
                      if (
                        !showingSlash &&
                        showingEmoteSuggestions &&
                        event.key === "ArrowUp" &&
                        emoteSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        setEmoteSelectionIndex(
                          (current) =>
                            (current - 1 + emoteSuggestions.length) %
                            emoteSuggestions.length,
                        );
                        return;
                      }
                      if (
                        event.key === "ArrowDown" &&
                        slashCommandSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        setSlashSelectionIndex(
                          (current) =>
                            (current + 1) % slashCommandSuggestions.length,
                        );
                        return;
                      }
                      if (
                        event.key === "ArrowUp" &&
                        slashCommandSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        setSlashSelectionIndex(
                          (current) =>
                            (current - 1 + slashCommandSuggestions.length) %
                            slashCommandSuggestions.length,
                        );
                        return;
                      }
                      if (event.key === "Escape" && showingSlash) {
                        event.preventDefault();
                        setMessageText("");
                        return;
                      }
                      if (
                        !showingSlash &&
                        showingEmoteSuggestions &&
                        (event.key === "Tab" ||
                          (event.key === "Enter" && !event.shiftKey)) &&
                        emoteSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        const selected =
                          emoteSuggestions[
                            Math.min(
                              emoteSelectionIndex,
                              emoteSuggestions.length - 1,
                            )
                          ] || emoteSuggestions[0];
                        if (!selected) return;
                        applyEmoteSuggestion(selected.name);
                        return;
                      }
                      if (
                        (event.key === "Tab" ||
                          (event.key === "Enter" && !event.shiftKey)) &&
                        slashCommandSuggestions.length > 0
                      ) {
                        event.preventDefault();
                        const selected =
                          slashCommandSuggestions[
                            Math.min(
                              slashSelectionIndex,
                              slashCommandSuggestions.length - 1,
                            )
                          ] || slashCommandSuggestions[0];
                        if (!selected) return;
                        applySlashCommandTemplate(selected);
                        return;
                      }
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                        return;
                      }
                      if (event.key === "Tab" && mentionSuggestions.length) {
                        event.preventDefault();
                        const mention = getMentionQuery(messageText);
                        if (!mention) return;
                        const selected = mentionSuggestions[0];
                        const prefix = messageText.slice(0, mention.start);
                        setMessageText(`${prefix}@{${selected}} `);
                      }
                    }}
                  />
                  {showingSlash && (
                    <div className="slash-command-suggestions">
                      <div className="slash-command-header">
                        COMMANDS MATCHING /{(slashQuery || "").toUpperCase()}
                      </div>
                      {slashCommandSuggestions.length === 0 ? (
                        <div className="slash-command-empty">
                          No commands found for this server.
                        </div>
                      ) : (
                        slashCommandSuggestions.map((command, index) => (
                          <button
                            key={command.name}
                            type="button"
                            className={`slash-command-item ${index === slashSelectionIndex ? "active" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              applySlashCommandTemplate(command);
                              setSlashSelectionIndex(index);
                            }}
                          >
                            <div>
                              <strong>/{command.name}</strong>
                              <p>
                                {command.description ||
                                  "No description provided."}
                              </p>
                            </div>
                            <span>
                              {command.extensionName || command.extensionId}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {renderEmoteSuggestionsPanel()}
                  {mentionSuggestions.length > 0 &&
                    !showingSlash &&
                    !showingEmoteSuggestions && (
                    <div className="mention-suggestions">
                      {mentionSuggestions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="mention-suggestion"
                          onClick={(event) => {
                            event.stopPropagation();
                            const mention = getMentionQuery(messageText);
                            if (!mention) return;
                            const prefix = messageText.slice(0, mention.start);
                            setMessageText(`${prefix}@{${name}} `);
                            composerInputRef.current?.focus();
                          }}
                        >
                          @{name}
                        </button>
                      ))}
                    </div>
                  )}
                  {renderEmotePickerPanel()}
                </div>
                <button
                  className="ghost composer-icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    openKlipyPicker();
                  }}
                  title="Search Klipy"
                  disabled={!activeChannelId}
                >
                  GIF
                </button>
                <button
                  className="ghost composer-icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    openFavouriteMediaPicker();
                  }}
                  title="Open favourites"
                  disabled={!activeChannelId}
                >
                  ★
                </button>
                <button
                  className="ghost composer-icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowEmotePicker((current) => !current);
                  }}
                  title="Open emotes"
                >
                  😀
                </button>
                <button
                  className="send-btn"
                  onClick={sendMessage}
                  disabled={
                    !activeChannelId ||
                    (!messageText.trim() && pendingAttachments.length === 0)
                  }
                >
                  Send
                </button>
              </footer>
                </>
              )}
            </section>

            {!showServerVoiceStage && (
            <aside className="members-pane">
              <h4>Members — {resolvedMemberList.length}</h4>
              {(() => {
                const rolesById = new Map(
                  (guildState?.roles || []).map((r) => [r.id, r]),
                );
                const getHighestRole = (member) => {
                  const memberRoles = (member.roleIds || [])
                    .map((id) => rolesById.get(id))
                    .filter(Boolean)
                    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
                  return memberRoles[0] || null;
                };
                const byHighestRole = new Map();
                for (const member of resolvedMemberList) {
                  const top = getHighestRole(member);
                  const key = top?.id ?? "__none__";
                  if (!byHighestRole.has(key))
                    byHighestRole.set(key, { role: top, members: [] });
                  byHighestRole.get(key).members.push(member);
                }
                const noneRole = {
                  id: "__none__",
                  name: "No role",
                  position: -1,
                  color: null,
                };
                const sections = Array.from(byHighestRole.entries()).map(
                  ([key, { role, members }]) => ({
                    role: role || noneRole,
                    members,
                  }),
                );
                sections.sort(
                  (a, b) => (b.role.position ?? 0) - (a.role.position ?? 0),
                );
                return sections.map(({ role, members }) => {
                  const roleColor =
                    role.color != null && role.color !== ""
                      ? typeof role.color === "number"
                        ? `#${Number(role.color).toString(16).padStart(6, "0")}`
                        : role.color
                      : null;
                  return (
                    <div className="members-role-section" key={role.id}>
                      <div
                        className="members-role-label"
                        style={roleColor ? { color: roleColor } : undefined}
                      >
                        {role.name}
                      </div>
                      {members.map((member) => {
                        const topRole = getHighestRole(member);
                        const color =
                          topRole?.color != null && topRole.color !== ""
                            ? typeof topRole.color === "number"
                              ? `#${Number(topRole.color).toString(16).padStart(6, "0")}`
                              : topRole.color
                            : null;
                        const memberVoice = mergedVoiceStates.find(
                          (vs) => vs.userId === member.id,
                        );
                        const inMyCall =
                          memberVoice?.channelId &&
                          memberVoice.channelId === voiceConnectedChannelId;
                        const speaking =
                          !!inMyCall &&
                          !!voiceSpeakingByGuild[activeGuildId]?.[member.id];
                        return (
                          <button
                            className="member-row"
                            key={member.id}
                            title={`View ${member.username}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openMemberProfile(member, {
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                            onContextMenu={(event) =>
                              openMemberContextMenu(event, member)
                            }
                          >
                            <div className={speaking ? "speaking" : ""}>
                              {renderPresenceAvatar({
                                userId: member.id,
                                username: member.username,
                                pfpUrl: member.pfp_url,
                                size: 32,
                              })}
                            </div>
                            <div>
                              <strong style={color ? { color } : undefined}>
                                {member.username}
                              </strong>
                              <span>
                                {memberVoice
                                  ? memberVoice.deafened
                                    ? "Deafened in voice"
                                    : memberVoice.muted
                                      ? "Muted in voice"
                                      : "In voice"
                                  : presenceLabel(getPresence(member.id))}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                });
              })()}
              {!resolvedMemberList.length && (
                <p className="hint">No visible members yet.</p>
              )}
            </aside>
            )}
          </div>
        )}

        {navMode === "dms" && (
          <section
            className={`chat-main ${showPrivateCallStage ? "chat-main-voice-stage" : ""} ${
              showPrivateCallDock ? "chat-main-with-private-call-dock" : ""
            }`}
          >
            <header className="chat-header dm-header-actions">
              <div className="dm-header-meta">
                <h3>{activeDm ? `@ ${activeDm.name}` : "Direct Messages"}</h3>
                {activeDm && (
                  <div className="dm-header-subline">
                    {renderOfficialBadge(activeDm.badgeDetails)}
                    {activeDm.isNoReply && (
                      <span className="dm-readonly-note">
                        Official announcements only
                      </span>
                    )}
                    {activeDmHasLivePrivateCall ? (
                      <span className="dm-live-call-pill">
                        Live call
                        {callDuration > 0
                          ? ` • ${formatCallDurationLabel(callDuration)}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="chat-actions">
                {showPrivateCallStage ? (
                  <input
                    className="search-input"
                    placeholder={`Search ${activeDm?.name || "messages"}`}
                  />
                ) : null}
                {activeDm?.participantId && !activeDm?.isNoReply && (
                  <button
                    type="button"
                    className={`dm-header-action-pill ${activeDmPrivateCallId ? "active" : ""}`}
                    title={
                      activeDmHasLivePrivateCall
                        ? showPrivateCallStage
                          ? "Back to chat"
                          : "Open call view"
                        : activeDmPrivateCallId
                          ? "Join call"
                          : `Call ${activeDm.name}`
                    }
                    onClick={() => {
                      if (activeDmHasLivePrivateCall) {
                        setPrivateCallViewOpen((value) => !value);
                        return;
                      }
                      if (activeDmPrivateCallId) {
                        void joinPrivateVoiceCall(activeDmPrivateCallId);
                        return;
                      }
                      startActiveDmCall();
                    }}
                  >
                    <span>
                      {activeDmHasLivePrivateCall
                        ? showPrivateCallStage
                          ? "💬"
                          : "🖥️"
                        : "📞"}
                    </span>
                    <strong>
                      {activeDmHasLivePrivateCall
                        ? showPrivateCallStage
                          ? "Chat"
                          : "Open call"
                        : activeDmPrivateCallId
                          ? "Join call"
                          : "Call"}
                    </strong>
                  </button>
                )}
                <button
                  className={`icon-btn ghost ${showPinned ? "active" : ""}`}
                  onClick={() => setShowPinned((value) => !value)}
                  title="Pinned DMs"
                >
                  📌
                </button>
                {activeDmHasLivePrivateCall && (
                  <button
                    className="icon-btn ghost"
                    style={{ color: "var(--danger, #ef5f76)" }}
                    title="End call"
                    onClick={endPrivateCall}
                  >
                    📵
                  </button>
                )}
              </div>
            </header>
            {showPrivateCallStage ? (
              <VoiceCallStage
                variant="dm"
                title={activePrivateCall?.otherName || activeDm?.name || "Private call"}
                subtitle={
                  activePrivateCall?.otherName || activeDm?.name
                    ? `Talking with ${activePrivateCall?.otherName || activeDm?.name}`
                    : "Private voice call"
                }
                participants={privateCallParticipants}
                remoteScreenShares={enrichedRemoteScreenShares}
                selectedRemoteScreenShare={selectedRemoteScreenShare}
                onSelectScreenShare={selectScreenShare}
                isConnected
                isMuted={isMuted}
                isDeafened={isDeafened}
                isCameraEnabled={isCameraEnabled}
                isScreenSharing={isScreenSharing}
                liveCameraCount={liveCameraCount}
                duration={callDuration}
                onToggleMute={() => setIsMuted((value) => !value)}
                onToggleDeafen={() => setIsDeafened((value) => !value)}
                onToggleCamera={toggleCamera}
                onToggleScreenShare={toggleScreenShare}
                onLeave={endPrivateCall}
                onClose={() => setPrivateCallViewOpen(false)}
                showClose
                leaveLabel="End call"
                emptyTitle="Focus the conversation"
                emptyDescription="Camera tiles, screen shares, and fullscreen viewing all live here while the private call is active."
              />
            ) : (
              <>
            {showPrivateCallDock && (
              <div className="private-call-stage-dock-slot">
                <VoiceCallStage
                  variant="dm"
                  presentation="dock"
                  title={activePrivateCall?.otherName || activeDm?.name || "Private call"}
                  subtitle={
                    activePrivateCall?.otherName || activeDm?.name
                      ? `Talking with ${activePrivateCall?.otherName || activeDm?.name}`
                      : "Private voice call"
                  }
                  participants={privateCallParticipants}
                  remoteScreenShares={enrichedRemoteScreenShares}
                  selectedRemoteScreenShare={selectedRemoteScreenShare}
                  onSelectScreenShare={selectScreenShare}
                  isConnected
                  isMuted={isMuted}
                  isDeafened={isDeafened}
                  isCameraEnabled={isCameraEnabled}
                  isScreenSharing={isScreenSharing}
                  liveCameraCount={liveCameraCount}
                  duration={callDuration}
                  onToggleMute={() => setIsMuted((value) => !value)}
                  onToggleDeafen={() => setIsDeafened((value) => !value)}
                  onToggleCamera={toggleCamera}
                  onToggleScreenShare={toggleScreenShare}
                  onExpand={() => setPrivateCallViewOpen(true)}
                  onLeave={endPrivateCall}
                  leaveLabel="End call"
                  emptyTitle="Focus the conversation"
                  emptyDescription="Camera tiles, screen shares, and fullscreen viewing all live here while the private call is active."
                />
              </div>
            )}
            {showPinned && activePinnedDmMessages.length > 0 && (
              <div className="pinned-strip">
                {activePinnedDmMessages.slice(0, 3).map((item) => (
                  <div key={item.id} className="pinned-item">
                    <strong>{item.author}</strong>
                    <span>{item.content}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="messages" ref={dmMessagesRef}>
              {(() => {
                let lastDayKey = "";
                return groupedDmMessages.map((group) => {
                  const groupDayKey = getMessageDayKey(group.firstMessageTime);
                  const showDateDivider =
                    !!groupDayKey && groupDayKey !== lastDayKey;
                  if (groupDayKey) lastDayKey = groupDayKey;

                  return (
                    <div key={`dm-group-wrap-${group.id}`}>
                      {showDateDivider && (
                        <div className="message-date-divider">
                          <span>
                            {formatMessageDate(group.firstMessageTime)}
                          </span>
                        </div>
                      )}
                      <article className="msg dm-msg grouped-msg">
                        <SafeAvatar
                          src={profileImageUrl(group.pfpUrl)}
                          alt={group.author}
                          name={group.author}
                          seed={group.authorId}
                          className="msg-avatar"
                          maxLetters={2}
                        />
                        <div className="msg-body">
                          <strong className="msg-author">
                            <span className="dm-author-row">
                              <button
                                className="name-btn"
                                onClick={(event) =>
                                  openMemberProfile(
                                    {
                                      id: group.authorId,
                                      username: group.author,
                                      status: getPresence(group.authorId),
                                      pfp_url: group.pfpUrl,
                                    },
                                    { x: event.clientX, y: event.clientY },
                                  )
                                }
                                onContextMenu={(event) =>
                                  openMemberContextMenu(event, {
                                    id: group.authorId,
                                    username: group.author,
                                    pfp_url: group.pfpUrl,
                                  })
                                }
                              >
                                {group.author}
                              </button>
                              {renderOfficialBadge(
                                group.messages?.[0]?.badgeDetails,
                                "official-badge--compact",
                              )}
                            </span>
                            <span className="msg-time">
                              {formatMessageTime(group.firstMessageTime)}
                            </span>
                          </strong>
                          {group.messages.map((message) => {
                            const derivedLinkEmbeds =
                              getDerivedLinkEmbeds(message);
                            const hideMessageContent =
                              isAssetOnlyMessageContent(message);
                            const isPinnedMessage =
                              activePinnedDmMessages.some(
                                (item) => item.id === message.id,
                              );
                            return (
                              <div
                                key={message.id}
                                className="message-entry"
                                onContextMenu={(event) =>
                                  openMessageContextMenu(event, {
                                    id: message.id,
                                    kind: "dm",
                                    authorId: message.authorId,
                                    author: message.author,
                                    authorUsername:
                                      message.authorUsername || message.author,
                                    content: message.content,
                                    createdAt:
                                      message.createdAt ||
                                      message.created_at ||
                                      "",
                                    attachments: message.attachments || [],
                                    threadId: activeDm?.id || "",
                                    mine: message.authorId === me?.id,
                                  })
                                }
                              >
                                {message.content === "__CALL_REQUEST__" ? (
                                  <CallMessageCard
                                    message={message}
                                    me={me}
                                    activeCallId={activeDmPrivateCallId}
                                    onJoin={joinPrivateVoiceCall}
                                    callerName={group.author}
                                  />
                                ) : (
                                  (!hideMessageContent || isPinnedMessage) && (
                                    <div className="message-content-wrap">
                                      {isPinnedMessage && (
                                        <span className="message-pin-prefix">
                                          📌 Pinned
                                        </span>
                                      )}
                                      {!hideMessageContent &&
                                        renderContentWithMentions(message)}
                                    </div>
                                  )
                                )}
                                {derivedLinkEmbeds.length > 0 && (
                                  <div className="message-embeds">
                                    {derivedLinkEmbeds.map((embed, index) =>
                                      renderMessageLinkEmbedCard(
                                        embed,
                                        `${message.id}-dm-derived-link-${index}`,
                                      ),
                                    )}
                                  </div>
                                )}
                                {Array.isArray(message?.attachments) &&
                                  message.attachments.length > 0 && (
                                    <div className="message-embeds">
                                      {message.attachments.map(
                                        (attachment, index) =>
                                          renderMessageAttachmentCard(
                                            attachment,
                                            `${message.id}-dm-att-${index}`,
                                          ),
                                      )}
                                    </div>
                                  )}
                                {message.content !== "__CALL_REQUEST__" &&
                                  renderMessageReactions(message, "dm")}
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    </div>
                  );
                });
              })()}
              {!activeDm && <p className="empty">Select a DM on the left.</p>}
            </div>
            {dmReplyTarget && (
              <div className="reply-banner">
                <span>Replying to {dmReplyTarget.author}</span>
                <button
                  className="ghost"
                  onClick={() => setDmReplyTarget(null)}
                >
                  Cancel
                </button>
              </div>
            )}
            {activeDm?.isNoReply && (
              <div className="reply-banner dm-readonly-banner">
                <span>
                  `opencom` is a no-reply official account. You can read its
                  messages, but you cannot reply.
                </span>
              </div>
            )}
            <footer
              className="composer dm-composer"
              onClick={() => dmComposerInputRef.current?.focus()}
            >
              <button
                className="ghost composer-icon"
                onClick={(event) => {
                  event.stopPropagation();
                  dmAttachmentInputRef.current?.click();
                }}
                title="Attach files"
                disabled={!activeDm || activeDm?.isNoReply}
              >
                ＋
              </button>
              <input
                ref={dmAttachmentInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={async (event) => {
                  const files = Array.from(event.target.files || []);
                  await uploadAttachments(files, "file picker", "dm");
                }}
              />
              <div className="composer-input-wrap">
                {pendingDmAttachments.length > 0 && (
                  <div className="mention-suggestions">
                    {pendingDmAttachments.map((attachment, index) => (
                      <div
                        key={`pending-dm-att-${index}`}
                        className="mention-suggestion"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          width: "100%",
                        }}
                      >
                        <span>{attachment.fileName || "attachment"}</span>
                        <button
                          type="button"
                          className="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDmAttachments((current) =>
                              current.filter((_, i) => i !== index),
                            );
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={dmComposerInputRef}
                  value={dmText}
                  onChange={(event) => setDmText(event.target.value)}
                  placeholder={
                    activeDm?.isNoReply
                      ? "This official account does not accept replies"
                      : `Message ${activeDm?.name || "friend"}`
                  }
                  title="Enter to send, Shift+Enter for a new line"
                  onPaste={(event) => {
                    const files = extractFilesFromClipboardData(
                      event.clipboardData,
                    );
                    if (!files.length) return;
                    event.preventDefault();
                    uploadAttachments(files, "clipboard", "dm").catch(() => {});
                  }}
                  onKeyDown={(event) => {
                    if (
                      showingEmoteSuggestions &&
                      event.key === "ArrowDown" &&
                      emoteSuggestions.length > 0
                    ) {
                      event.preventDefault();
                      setEmoteSelectionIndex(
                        (current) => (current + 1) % emoteSuggestions.length,
                      );
                      return;
                    }
                    if (
                      showingEmoteSuggestions &&
                      event.key === "ArrowUp" &&
                      emoteSuggestions.length > 0
                    ) {
                      event.preventDefault();
                      setEmoteSelectionIndex(
                        (current) =>
                          (current - 1 + emoteSuggestions.length) %
                          emoteSuggestions.length,
                      );
                      return;
                    }
                    if (
                      showingEmoteSuggestions &&
                      (event.key === "Tab" ||
                        (event.key === "Enter" && !event.shiftKey)) &&
                      emoteSuggestions.length > 0
                    ) {
                      event.preventDefault();
                      const selected =
                        emoteSuggestions[
                          Math.min(
                            emoteSelectionIndex,
                            emoteSuggestions.length - 1,
                          )
                        ] || emoteSuggestions[0];
                      if (!selected) return;
                      applyEmoteSuggestion(selected.name);
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendDm();
                    }
                  }}
                  disabled={!activeDm || activeDm?.isNoReply}
                />
                {renderEmoteSuggestionsPanel()}
                {renderEmotePickerPanel()}
              </div>
              <button
                className="ghost composer-icon"
                onClick={(event) => {
                  event.stopPropagation();
                  openKlipyPicker();
                }}
                title="Search Klipy"
                disabled={!activeDm || activeDm?.isNoReply}
              >
                GIF
              </button>
              <button
                className="ghost composer-icon"
                onClick={(event) => {
                  event.stopPropagation();
                  openFavouriteMediaPicker();
                }}
                title="Open favourites"
                disabled={!activeDm || activeDm?.isNoReply}
              >
                ★
              </button>
              <button
                className="ghost composer-icon"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowEmotePicker((current) => !current);
                }}
                title="Open emotes"
                disabled={!activeDm || activeDm?.isNoReply}
              >
                😀
              </button>
              <button
                className="send-btn"
                onClick={sendDm}
                disabled={
                  !activeDm ||
                  activeDm?.isNoReply ||
                  (!dmText.trim() && pendingDmAttachments.length === 0)
                }
              >
                Send
              </button>
            </footer>
              </>
            )}
          </section>
        )}

        {navMode === "friends" && (
          <FriendsSurface
            friendView={friendView}
            setFriendView={setFriendView}
            friendQuery={friendQuery}
            setFriendQuery={setFriendQuery}
            friendAddInput={friendAddInput}
            setFriendAddInput={setFriendAddInput}
            addFriend={addFriend}
            friendRequests={friendRequests}
            respondToFriendRequest={respondToFriendRequest}
            filteredFriends={filteredFriends}
            getPresence={getPresence}
            presenceLabel={presenceLabel}
            getActivitySummary={getActivitySummary}
            renderPresenceAvatar={renderPresenceAvatar}
            openDmFromFriend={openDmFromFriend}
            openMemberProfile={openMemberProfile}
          />
        )}

        {navMode === "profile" && (
          <ProfileStudioPage
            resetFullProfileDraftToBasic={resetFullProfileDraftToBasic}
            saveFullProfileDraft={saveFullProfileDraft}
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            onAvatarUpload={onAvatarUpload}
            onBannerUpload={onBannerUpload}
            saveProfile={saveProfile}
            addFullProfileElement={addFullProfileElement}
            fullProfileDraft={fullProfileDraft}
            addFullProfileTextBlock={addFullProfileTextBlock}
            hasBoostForFullProfiles={hasBoostForFullProfiles}
            fullProfileEditorCanvasRef={fullProfileEditorCanvasRef}
            profileStudioCanvasMinHeight={profileStudioCanvasMinHeight}
            getFullProfileFontFamily={getFullProfileFontFamily}
            fullProfileDraggingElementId={fullProfileDraggingElementId}
            profileStudioSelectedElementId={profileStudioSelectedElementId}
            getFullProfileElementFrameStyle={getFullProfileElementFrameStyle}
            onFullProfileElementMouseDown={onFullProfileElementMouseDown}
            setProfileStudioSelectedElementId={
              setProfileStudioSelectedElementId
            }
            renderFullProfileElement={renderFullProfileElement}
            profileStudioPreviewProfile={profileStudioPreviewProfile}
            openBoostUpsell={openBoostUpsell}
            selectedProfileStudioElement={selectedProfileStudioElement}
            updateFullProfileElement={updateFullProfileElement}
            nudgeFullProfileElement={nudgeFullProfileElement}
            removeFullProfileElement={removeFullProfileElement}
            setFullProfileDraft={setFullProfileDraft}
            updateFullProfileLink={updateFullProfileLink}
            removeFullProfileLink={removeFullProfileLink}
            addFullProfileLink={addFullProfileLink}
            onAudioFieldUpload={onAudioFieldUpload}
          />
        )}

        {navMode === "server-admin" && (
          <ServerAdminApp
            embedded
            preferredServerId={serverAdminIntent.serverId || activeServerId}
            preferredGuildId={serverAdminIntent.guildId}
            preferredTab={serverAdminIntent.tab}
            preferredChannelId={serverAdminIntent.channelId}
            preferredChannelAction={serverAdminIntent.channelAction}
            intentNonce={serverAdminIntent.nonce}
            onSelectServer={(serverId) => {
              setActiveServerId(serverId);
              setServerAdminIntent((current) => ({
                ...current,
                serverId,
              }));
              setActiveGuildId("");
              setGuildState(null);
              setMessages([]);
            }}
            onExit={() => setNavMode(activeServerId ? "servers" : "friends")}
          />
        )}

        {navMode === "themes" && (
          <ThemeStudioApp
            activeTab={themeStudioTab}
            onTabChange={setThemeStudioTab}
            themeCss={themeCss}
            setThemeCss={setThemeCss}
            setThemeEnabled={setThemeEnabled}
          />
        )}
      </main>

      <AppContextMenus
        messageContextMenu={messageContextMenu}
        addMessageReaction={promptAddReactionToMessage}
        setReplyTarget={setReplyTarget}
        setDmReplyTarget={setDmReplyTarget}
        reportMessage={reportMessage}
        setMessageContextMenu={setMessageContextMenu}
        togglePinMessage={togglePinMessage}
        setStatus={setStatus}
        canDeleteServerMessages={canDeleteServerMessages}
        deleteServerMessage={deleteServerMessage}
        deleteDmMessage={deleteDmMessage}
        memberContextMenu={memberContextMenu}
        voiceStateByUserId={voiceStateByUserId}
        getVoiceMemberAudioPref={getVoiceMemberAudioPref}
        setVoiceMemberAudioPref={setVoiceMemberAudioPref}
        promptSetVoiceMemberLocalVolume={promptSetVoiceMemberLocalVolume}
        me={me}
        canServerMuteMembers={canServerMuteMembers}
        canServerDeafenMembers={canServerDeafenMembers}
        canMoveVoiceMembers={canMoveVoiceMembers}
        setServerVoiceMemberState={setServerVoiceMemberState}
        disconnectVoiceMember={disconnectVoiceMember}
        openMemberProfile={openMemberProfile}
        openDmFromFriend={openDmFromFriend}
        canKickMembers={canKickMembers}
        kickMember={kickMember}
        canBanMembers={canBanMembers}
        banMember={banMember}
        canModerateMembers={canModerateMembers}
        setModerationMemberId={setModerationMemberId}
        setSettingsOpen={setSettingsOpen}
        setSettingsTab={setSettingsTab}
        setMemberContextMenu={setMemberContextMenu}
        serverContextMenu={serverContextMenu}
        openServerFromContext={openServerFromContext}
        canAccessServerAdminPanel={canAccessServerAdminPanel}
        openServerAdmin={openServerAdmin}
        canManageServer={canManageServer}
        activeServerId={activeServerId}
        workingGuildId={workingGuildId}
        promptCreateChannelFlow={promptCreateChannelFlow}
        moveServerInRail={moveServerInRail}
        setInviteServerId={setInviteServerId}
        copyServerId={copyServerId}
        leaveServer={leaveServer}
        deleteServer={deleteServer}
        setServerContextMenu={setServerContextMenu}
        channelContextMenu={channelContextMenu}
        openChannelSettings={openChannelSettings}
        setChannelPermsChannelId={setChannelPermsChannelId}
        setChannelContextMenu={setChannelContextMenu}
        setActiveChannelId={setActiveChannelId}
        deleteChannelById={deleteChannelById}
        categoryContextMenu={categoryContextMenu}
        setCategoryContextMenu={setCategoryContextMenu}
      />

      <AddServerModal
        addServerModalOpen={addServerModalOpen}
        setAddServerModalOpen={setAddServerModalOpen}
        addServerTab={addServerTab}
        setAddServerTab={setAddServerTab}
        canAccessServerAdminPanel={canAccessServerAdminPanel}
        onOpenServerAdmin={() =>
          openServerAdmin(activeServerId, { closeAddServer: true })
        }
        joinInviteCode={joinInviteCode}
        setJoinInviteCode={setJoinInviteCode}
        previewInvite={previewInvite}
        joinInvite={joinInvite}
        invitePendingCode={invitePendingCode}
        invitePreview={invitePreview}
        newServerName={newServerName}
        setNewServerName={setNewServerName}
        newServerBaseUrl={newServerBaseUrl}
        setNewServerBaseUrl={setNewServerBaseUrl}
        newServerLogoUrl={newServerLogoUrl}
        setNewServerLogoUrl={setNewServerLogoUrl}
        onImageFieldUpload={onImageFieldUpload}
        newServerBannerUrl={newServerBannerUrl}
        setNewServerBannerUrl={setNewServerBannerUrl}
        createServer={createServer}
        newOfficialServerName={newOfficialServerName}
        setNewOfficialServerName={setNewOfficialServerName}
        newOfficialServerLogoUrl={newOfficialServerLogoUrl}
        setNewOfficialServerLogoUrl={setNewOfficialServerLogoUrl}
        newOfficialServerBannerUrl={newOfficialServerBannerUrl}
        setNewOfficialServerBannerUrl={setNewOfficialServerBannerUrl}
        createOfficialServer={createOfficialServer}
      />

      <MemberProfilePopout
        memberProfileCard={memberProfileCard}
        memberProfilePopoutRef={memberProfilePopoutRef}
        profileCardPosition={profileCardPosition}
        openMemberContextMenu={openMemberContextMenu}
        startDraggingProfileCard={startDraggingProfileCard}
        profileImageUrl={profileImageUrl}
        getInitials={getInitials}
        presenceLabel={presenceLabel}
        getPresence={getPresence}
        formatAccountCreated={formatAccountCreated}
        getBadgePresentation={getBadgePresentation}
        guildState={guildState}
        getRichPresence={getRichPresence}
        openDmFromFriend={openDmFromFriend}
        openFullProfileViewer={openFullProfileViewer}
        canKickMembers={canKickMembers}
        me={me}
        kickMember={kickMember}
        canBanMembers={canBanMembers}
        banMember={banMember}
        setMemberProfileCard={setMemberProfileCard}
      />

      <FullProfileViewerModal
        fullProfileViewer={fullProfileViewer}
        setFullProfileViewer={setFullProfileViewer}
        profileImageUrl={profileImageUrl}
        getFullProfileFontFamily={getFullProfileFontFamily}
        getFullProfileElementFrameStyle={getFullProfileElementFrameStyle}
        toggleFullProfileViewerMusicPlayback={
          toggleFullProfileViewerMusicPlayback
        }
        renderFullProfileElement={renderFullProfileElement}
        fullProfileViewerMusicPlaying={fullProfileViewerMusicPlaying}
        fullProfileViewerHasPlayableMusic={fullProfileViewerHasPlayableMusic}
        fullProfileViewerMusicAudioRef={fullProfileViewerMusicAudioRef}
        setFullProfileViewerMusicPlaying={setFullProfileViewerMusicPlaying}
      />

      <AppDialogModal
        dialogModal={dialogModal}
        resolveDialog={resolveDialog}
        setDialogModal={setDialogModal}
        dialogInputRef={dialogInputRef}
      />

      <MessageReactionPickerModal
        open={!!messageReactionPicker && !!activeMessageReactionTarget}
        onClose={() => {
          setMessageReactionPicker(null);
          setMessageReactionPickerQuery("");
        }}
        query={messageReactionPickerQuery}
        setQuery={setMessageReactionPickerQuery}
        customSections={customPickerSections}
        builtinSections={reactionPickerBuiltinSections}
        searchResults={reactionPickerSearchResults}
        onSelect={(emoteName) => {
          if (!activeMessageReactionTarget || !messageReactionPicker?.kind) return;
          void addReactionToMessageFromPicker(
            activeMessageReactionTarget,
            messageReactionPicker.kind,
            emoteName,
          );
        }}
      />

      <FavouriteMediaModal
        open={favouriteMediaModalOpen}
        onClose={() => setFavouriteMediaModalOpen(false)}
        favourites={filteredFavouriteMedia}
        loading={favouriteMediaLoading}
        query={favouriteMediaQuery}
        setQuery={setFavouriteMediaQuery}
        previewUrlById={favouriteMediaPreviewUrlById}
        onSelect={insertFavouriteMedia}
        onRemove={toggleFavouriteMedia}
        removeBusyById={favouriteMediaBusyById}
        insertBusyId={favouriteMediaInsertBusyId}
      />

      <KlipyMediaModal
        open={klipyModalOpen}
        onClose={closeKlipyPicker}
        query={klipyQuery}
        setQuery={setKlipyQuery}
        items={klipyItems}
        loading={klipyLoading}
        hasMore={!!klipyNext}
        insertBusyId={klipyInsertBusyId}
        saveStateByItemId={klipySaveStateByItemId}
        onSelect={insertKlipyMedia}
        onSave={(item) => {
          void toggleKlipyFavourite(item);
        }}
        onLoadMore={() => {
          void loadKlipyMedia({
            queryText: klipyQuery,
            append: true,
            nextToken: klipyNext,
          });
        }}
      />

      <MediaViewerModal
        media={expandedMedia}
        onClose={() => setExpandedMedia(null)}
      />

      <BoostUpsellModal
        boostUpsell={boostUpsell}
        setBoostUpsell={setBoostUpsell}
        openBoostSettingsFromUpsell={openBoostSettingsFromUpsell}
      />

      <BoostGiftPromptModal
        boostGiftPrompt={boostGiftPrompt}
        setBoostGiftPrompt={setBoostGiftPrompt}
        boostGiftRedeeming={boostGiftRedeeming}
        redeemBoostGift={redeemBoostGift}
      />

      <SettingsOverlay
        settingsOpen={settingsOpen}
        closeSettings={() => setSettingsOpen(false)}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        onOpenSecurity={() => {
          setSettingsTab("security");
          loadSessions();
        }}
        onOpenBilling={() => {
          setSettingsTab("billing");
          loadBoostStatus();
          loadSentBoostGifts();
        }}
        canModerateMembers={canModerateMembers}
        canAccessServerAdminPanel={canAccessServerAdminPanel}
        onOpenServerAdmin={() =>
          openServerAdmin(activeServerId, { closeSettings: true })
        }
        logout={logout}
      >
        {settingsTab === "profile" && (
          <ProfileSettingsSection
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            onAvatarUpload={onAvatarUpload}
            onBannerUpload={onBannerUpload}
            onAudioFieldUpload={onAudioFieldUpload}
            saveProfile={saveProfile}
            testNotificationSound={testNotificationSound}
            isDesktopRuntime={isDesktopRuntime}
            openPreferredDesktopDownload={openPreferredDesktopDownload}
            preferredDownloadTarget={preferredDownloadTarget}
            downloadTargets={DOWNLOAD_TARGETS}
            onOpenProfileStudio={() => {
              setSettingsOpen(false);
              setNavMode("profile");
            }}
            rpcForm={rpcForm}
            setRpcForm={setRpcForm}
            onImageFieldUpload={onImageFieldUpload}
            saveRichPresence={saveRichPresence}
            clearRichPresence={clearRichPresence}
          />
        )}

        {settingsTab === "server" && (
          <ServerSettingsSection
            serverState={{
              activeServer,
              servers,
              canManageServer,
              boostStatus,
              activeServerVoiceGatewayPref,
              categoryChannels,
              sortedChannels,
              channelPermsChannelId,
              guildState,
            }}
            forms={{
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
            }}
            actions={{
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
            }}
          />
        )}

        {settingsTab === "roles" && (
          <RolesSettingsSection
            canManageServer={canManageServer}
            newRoleName={newRoleName}
            setNewRoleName={setNewRoleName}
            createRole={createRole}
            guildState={guildState}
            updateRole={updateRole}
            selectedMemberId={selectedMemberId}
            setSelectedMemberId={setSelectedMemberId}
            resolvedMemberList={resolvedMemberList}
            selectedRoleId={selectedRoleId}
            setSelectedRoleId={setSelectedRoleId}
            assignRoleToMember={assignRoleToMember}
          />
        )}

        {settingsTab === "moderation" && (
          <ModerationSettingsSection
            canModerateMembers={canModerateMembers}
            resolvedMemberList={resolvedMemberList}
            me={me}
            moderationMemberId={moderationMemberId}
            setModerationMemberId={setModerationMemberId}
            canBanMembers={canBanMembers}
            moderationBanReason={moderationBanReason}
            setModerationBanReason={setModerationBanReason}
            canKickMembers={canKickMembers}
            moderationBusy={moderationBusy}
            kickMember={kickMember}
            banMember={banMember}
            moderationUnbanUserId={moderationUnbanUserId}
            setModerationUnbanUserId={setModerationUnbanUserId}
            unbanMember={unbanMember}
          />
        )}

        {settingsTab === "invites" && (
          <InvitesSettingsSection
            joinInviteCode={joinInviteCode}
            setJoinInviteCode={setJoinInviteCode}
            previewInvite={previewInvite}
            joinInvite={joinInvite}
            invitePendingCode={invitePendingCode}
            invitePreview={invitePreview}
            inviteServerId={inviteServerId}
            setInviteServerId={setInviteServerId}
            servers={servers}
            inviteCustomCode={inviteCustomCode}
            setInviteCustomCode={setInviteCustomCode}
            boostStatus={boostStatus}
            showBoostUpsell={showBoostUpsell}
            invitePermanent={invitePermanent}
            setInvitePermanent={setInvitePermanent}
            createInvite={createInvite}
            inviteCode={inviteCode}
            inviteJoinUrl={inviteJoinUrl}
            buildInviteJoinUrl={buildInviteJoinUrl}
            setStatus={setStatus}
          />
        )}

        {settingsTab === "extensions" && (
          <ExtensionsSettingsSection
            activeServer={activeServer}
            canManageServer={canManageServer}
            refreshServerExtensions={refreshServerExtensions}
            serverExtensionsLoading={serverExtensionsLoading}
            serverExtensionsForDisplay={serverExtensionsForDisplay}
            serverExtensionBusyById={serverExtensionBusyById}
            toggleServerExtension={toggleServerExtension}
            serverExtensionCommands={serverExtensionCommands}
            clientExtensionCatalog={clientExtensionCatalog}
            enabledClientExtensions={enabledClientExtensions}
            toggleClientExtension={toggleClientExtension}
            clientExtensionLoadState={clientExtensionLoadState}
            clientExtensionDevMode={clientExtensionDevMode}
            setClientExtensionDevMode={setClientExtensionDevMode}
            newClientExtensionDevUrl={newClientExtensionDevUrl}
            setNewClientExtensionDevUrl={setNewClientExtensionDevUrl}
            addClientDevExtensionUrl={addClientDevExtensionUrl}
            clientExtensionDevUrls={clientExtensionDevUrls}
            setClientExtensionDevUrls={setClientExtensionDevUrls}
          />
        )}

        {settingsTab === "appearance" && (
          <AppearanceSettingsSection
            themeEnabled={themeEnabled}
            setThemeEnabled={setThemeEnabled}
            onUploadTheme={onUploadTheme}
            themeCss={themeCss}
            setThemeCss={setThemeCss}
            onOpenThemeCatalogue={() =>
              openThemeStudio("catalog", { closeSettings: true })
            }
            onOpenThemeCreator={() =>
              openThemeStudio("creator", { closeSettings: true })
            }
          />
        )}

        {settingsTab === "voice" && (
          <VoiceSettingsSection
            audioInputDeviceId={audioInputDeviceId}
            setAudioInputDeviceId={setAudioInputDeviceId}
            audioInputDevices={audioInputDevices}
            audioOutputDeviceId={audioOutputDeviceId}
            setAudioOutputDeviceId={setAudioOutputDeviceId}
            audioOutputDevices={audioOutputDevices}
            isMicMonitorActive={isMicMonitorActive}
            toggleMicMonitor={toggleMicMonitor}
            isInVoiceChannel={isInVoiceChannel}
            micGain={micGain}
            setMicGain={setMicGain}
            micSensitivity={micSensitivity}
            setMicSensitivity={setMicSensitivity}
            noiseSuppressionEnabled={noiseSuppressionEnabled}
            setNoiseSuppressionEnabled={setNoiseSuppressionEnabled}
            noiseCancellationMode={noiseCancellationMode}
            setNoiseCancellationMode={setNoiseCancellationMode}
            smartNoiseSuppressionProfile={smartNoiseSuppressionProfile}
            applySmartNoiseSuppressionProfile={applySmartNoiseSuppressionProfile}
            noiseSuppressionPreset={noiseSuppressionPreset}
            applyNoiseSuppressionPreset={applyNoiseSuppressionPreset}
            noiseSuppressionConfig={noiseSuppressionConfig}
            updateNoiseSuppressionConfig={updateNoiseSuppressionConfig}
            localAudioProcessingInfo={localAudioProcessingInfo}
          />
        )}

        {settingsTab === "billing" && (
          <BillingSettingsSection
            boostStatus={boostStatus}
            boostLoading={boostLoading}
            startBoostCheckout={startBoostCheckout}
            openBoostPortal={openBoostPortal}
            loadBoostStatus={loadBoostStatus}
            startBoostGiftCheckout={startBoostGiftCheckout}
            boostGiftCheckoutBusy={boostGiftCheckoutBusy}
            loadSentBoostGifts={loadSentBoostGifts}
            boostGiftCode={boostGiftCode}
            setBoostGiftCode={setBoostGiftCode}
            previewBoostGift={previewBoostGift}
            boostGiftLoading={boostGiftLoading}
            boostGiftPreview={boostGiftPreview}
            setBoostGiftPrompt={setBoostGiftPrompt}
            boostGiftSent={boostGiftSent}
            buildBoostGiftUrl={buildBoostGiftUrl}
            setStatus={setStatus}
          />
        )}

        {settingsTab === "security" && (
          <SecuritySettingsSection
            lastLoginInfo={lastLoginInfo}
            showPasswordChange={showPasswordChange}
            setShowPasswordChange={setShowPasswordChange}
            currentPassword={currentPassword}
            setCurrentPassword={setCurrentPassword}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            userEmail={me?.email || ""}
            onSendPasswordResetLink={requestPasswordReset}
            api={api}
            accessToken={accessToken}
            setStatus={setStatus}
            securitySettings={securitySettings}
            show2FASetup={show2FASetup}
            twoFactorVerified={twoFactorVerified}
            initiate2FASetup={initiate2FASetup}
            twoFactorQRCode={twoFactorQRCode}
            twoFactorToken={twoFactorToken}
            setTwoFactorToken={setTwoFactorToken}
            backupCodes={backupCodes}
            setTwoFactorSecret={setTwoFactorSecret}
            setBackupCodes={setBackupCodes}
            confirm2FA={confirm2FA}
            disable2FA={disable2FA}
            activeSessions={activeSessions}
            confirmDialog={confirmDialog}
          />
        )}

        <p className="status">{status}</p>
      </SettingsOverlay>
    </div>
  );
}
