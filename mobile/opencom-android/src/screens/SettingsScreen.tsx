import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { File } from "expo-file-system";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/Avatar";
import { ScreenBackground, SurfaceCard, TopBar } from "../components/chrome";
import {
  guessMimeTypeFromFileName,
  isFilePickerCancellation,
} from "../attachments";
import type { UserStatus } from "../types";
import { colors, radii, spacing, typography } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsScreenProps = {
  onLogout: () => void;
};

type TabId = "profile" | "status" | "account" | "sessions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: {
  value: UserStatus;
  label: string;
  emoji: string;
  color: string;
}[] = [
  { value: "online", label: "Online", emoji: "🟢", color: "#37cd93" },
  { value: "idle", label: "Idle", emoji: "🌙", color: "#f0b429" },
  { value: "dnd", label: "Do Not Disturb", emoji: "⛔", color: "#ef5f76" },
  { value: "invisible", label: "Invisible", emoji: "👻", color: "#90a5cf" },
];

function formatSessionDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.wrapper}>
      {title ? (
        <Text style={sectionStyles.title}>{title.toUpperCase()}</Text>
      ) : null}
      <View style={sectionStyles.card}>{children}</View>
    </View>
  );
}

function SectionRow({
  label,
  value,
  onPress,
  danger,
  children,
  last,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  children?: React.ReactNode;
  last?: boolean;
}) {
  const inner = (
    <View style={[sectionStyles.row, !last && sectionStyles.rowBorder]}>
      <Text
        style={[sectionStyles.rowLabel, danger && sectionStyles.rowLabelDanger]}
      >
        {label}
      </Text>
      {children ? (
        <View style={sectionStyles.rowRight}>{children}</View>
      ) : value ? (
        <Text style={sectionStyles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && !children ? (
        <Text style={sectionStyles.rowChevron}>›</Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => (pressed ? sectionStyles.pressed : undefined)}
        onPress={onPress}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const sectionStyles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textDim,
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.sidebar,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    gap: spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  rowLabelDanger: { color: colors.danger },
  rowValue: {
    ...typography.body,
    color: colors.textDim,
    maxWidth: "50%",
    textAlign: "right",
  },
  rowRight: { flexShrink: 0 },
  rowChevron: {
    fontSize: 20,
    color: colors.textDim,
    flexShrink: 0,
  },
  pressed: { backgroundColor: colors.hover },
});

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "status", label: "Status" },
    { id: "account", label: "Account" },
    { id: "sessions", label: "Sessions" },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tabStyles.container}
      style={tabStyles.bar}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          style={[tabStyles.tab, active === tab.id && tabStyles.tabActive]}
          onPress={() => onChange(tab.id)}
        >
          <Text
            style={[
              tabStyles.tabText,
              active === tab.id && tabStyles.tabTextActive,
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    marginHorizontal: spacing.md,
  },
  container: {
    flexDirection: "row",
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.sidebarStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
  },
  tabActive: { backgroundColor: colors.active },
  tabText: { ...typography.body, color: colors.textDim, fontWeight: "600" },
  tabTextActive: { color: colors.text },
});

// ─── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { api, me, myProfile, setMyProfile, refreshMyProfile } = useAuth();

  const [displayName, setDisplayName] = useState(myProfile?.displayName ?? "");
  const [bio, setBio] = useState(myProfile?.bio ?? "");
  const [pfpUrl, setPfpUrl] = useState(myProfile?.pfp_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(myProfile?.banner_url ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [status, setStatus] = useState("");

  // Sync form when profile loads
  useEffect(() => {
    setDisplayName(myProfile?.displayName ?? "");
    setBio(myProfile?.bio ?? "");
    setPfpUrl(myProfile?.pfp_url ?? "");
    setBannerUrl(myProfile?.banner_url ?? "");
  }, [myProfile]);

  useEffect(() => {
    refreshMyProfile();
  }, []); // eslint-disable-line

  const handleUploadImage = useCallback(
    async (fieldName: "pfp" | "banner") => {
      if (fieldName === "pfp" ? uploadingAvatar : uploadingBanner) return;
      if (fieldName === "pfp") setUploadingAvatar(true);
      else setUploadingBanner(true);

      try {
        const picked = await File.pickFileAsync();
        const file = Array.isArray(picked) ? picked[0] : picked;
        if (!file?.uri) throw new Error("FILE_PICK_FAILED");

        setStatus(
          fieldName === "pfp"
            ? "Uploading avatar..."
            : "Uploading banner...",
        );

        const result = await api.uploadProfileImage(
          file.uri,
          fieldName,
          {
            filename: file.name,
            mimeType: guessMimeTypeFromFileName(file.name, file.type),
          },
        );
        if (fieldName === "pfp") {
          setPfpUrl(result.url);
          if (myProfile) {
            setMyProfile({ ...myProfile, pfp_url: result.url });
          }
        } else {
          setBannerUrl(result.url);
          if (myProfile) {
            setMyProfile({ ...myProfile, banner_url: result.url });
          }
        }
        setStatus(
          fieldName === "pfp"
            ? "Avatar uploaded!"
            : "Banner uploaded!",
        );
      } catch (error) {
        if (!isFilePickerCancellation(error)) {
          setStatus(
            fieldName === "pfp"
              ? "Failed to upload avatar."
              : "Failed to upload banner.",
          );
        }
      } finally {
        if (fieldName === "pfp") setUploadingAvatar(false);
        else setUploadingBanner(false);
      }
    },
    [api, myProfile, setMyProfile, uploadingAvatar, uploadingBanner],
  );

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setStatus("");
    try {
      await api.updateProfile({
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        pfpUrl: pfpUrl.trim() || null,
        bannerUrl: bannerUrl.trim() || null,
      });
      setMyProfile({
        id: me?.id ?? "",
        username: me?.username ?? "",
        email: myProfile?.email ?? "",
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        pfp_url: pfpUrl.trim() || null,
        banner_url: bannerUrl.trim() || null,
      });
      setStatus("Profile saved!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save profile.";
      setStatus(msg);
    } finally {
      setSaving(false);
    }
  }, [
    api,
    me,
    myProfile,
    displayName,
    bio,
    pfpUrl,
    bannerUrl,
    saving,
    setMyProfile,
  ]);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Avatar preview */}
      <View style={styles.avatarPreview}>
        <Avatar
          username={displayName || me?.username}
          pfpUrl={pfpUrl || null}
          size={80}
          showStatus={false}
        />
        <View style={styles.avatarInfo}>
          <Text style={styles.avatarUsername}>{me?.username}</Text>
          {displayName ? (
            <Text style={styles.avatarDisplayName}>{displayName}</Text>
          ) : null}
        </View>
      </View>

      <Section title="Display">
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            style={styles.textInput}
            placeholder={me?.username ?? "Your display name"}
            placeholderTextColor={colors.textDim}
            maxLength={64}
            autoCorrect={false}
          />
        </View>

        <View style={[styles.inputGroup, styles.inputGroupLast]}>
          <Text style={styles.inputLabel}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            style={[styles.textInput, styles.textInputMulti]}
            placeholder="Tell others about yourself…"
            placeholderTextColor={colors.textDim}
            maxLength={256}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.inputHint}>{bio.length}/256</Text>
        </View>
      </Section>

      <Section title="Images (URL)">
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Avatar URL</Text>
          <TextInput
            value={pfpUrl}
            onChangeText={setPfpUrl}
            style={styles.textInput}
            placeholder="https://…"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable
            style={[
              styles.secondaryBtn,
              uploadingAvatar && styles.saveBtnDisabled,
            ]}
            onPress={() => handleUploadImage("pfp")}
            disabled={uploadingAvatar}
          >
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.secondaryBtnText}>Upload avatar</Text>
            )}
          </Pressable>
        </View>

        <View style={[styles.inputGroup, styles.inputGroupLast]}>
          <Text style={styles.inputLabel}>Banner URL</Text>
          <TextInput
            value={bannerUrl}
            onChangeText={setBannerUrl}
            style={styles.textInput}
            placeholder="https://…"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable
            style={[
              styles.secondaryBtn,
              uploadingBanner && styles.saveBtnDisabled,
            ]}
            onPress={() => handleUploadImage("banner")}
            disabled={uploadingBanner}
          >
            {uploadingBanner ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.secondaryBtnText}>Upload banner</Text>
            )}
          </Pressable>
        </View>
      </Section>

      {!!status && (
        <Text
          style={[
            styles.formStatus,
            status.includes("saved") && styles.formStatusSuccess,
          ]}
        >
          {status}
        </Text>
      )}

      <Pressable
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save Profile</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

// ─── Status tab ───────────────────────────────────────────────────────────────

function StatusTab() {
  const {
    me,
    selfStatus,
    selfCustomStatus,
    setSelfStatus,
    setSelfCustomStatus,
    updatePresence,
  } = useAuth();

  const [customStatus, setCustomStatus] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setCustomStatus(selfCustomStatus ?? "");
  }, [selfCustomStatus]);

  const handleSetStatus = useCallback(
    (status: UserStatus) => {
      setFeedback("");
      setSelfStatus(status);
      if (me?.id) {
        updatePresence(me.id, status, selfCustomStatus);
      }
      setFeedback("Status updated!");
    },
    [me?.id, selfCustomStatus, setSelfStatus, updatePresence],
  );

  const handleSaveCustomStatus = useCallback(() => {
    const nextCustomStatus = customStatus.trim() || null;
    setFeedback("");
    setSelfCustomStatus(nextCustomStatus);
    if (me?.id) {
      updatePresence(me.id, selfStatus, nextCustomStatus);
    }
    setFeedback("Custom status saved!");
  }, [customStatus, me?.id, selfStatus, setSelfCustomStatus, updatePresence]);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Section title="Presence">
        {STATUS_OPTIONS.map((opt, i) => (
          <Pressable
            key={opt.value}
            style={({ pressed }) => [
              styles.statusOption,
              i < STATUS_OPTIONS.length - 1 && styles.statusOptionBorder,
              pressed && styles.statusOptionPressed,
            ]}
            onPress={() => handleSetStatus(opt.value)}
          >
            <Text style={styles.statusEmoji}>{opt.emoji}</Text>
            <Text style={[styles.statusLabel, { color: opt.color }]}>
              {opt.label}
            </Text>
            {selfStatus === opt.value ? (
              <Text style={styles.statusCheck}>✓</Text>
            ) : null}
          </Pressable>
        ))}
      </Section>

      <Section title="Custom Status">
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>What's on your mind?</Text>
          <TextInput
            value={customStatus}
            onChangeText={setCustomStatus}
            style={styles.textInput}
            placeholder="Set a custom status…"
            placeholderTextColor={colors.textDim}
            maxLength={128}
          />
        </View>
        <View style={[styles.inputGroup, styles.inputGroupLast]}>
          <Pressable style={styles.saveBtn} onPress={handleSaveCustomStatus}>
            <Text style={styles.saveBtnText}>Save Status</Text>
          </Pressable>
        </View>
      </Section>

      {!!feedback && (
        <Text
          style={[
            styles.formStatus,
            feedback.includes("saved") || feedback.includes("updated")
              ? styles.formStatusSuccess
              : undefined,
          ]}
        >
          {feedback}
        </Text>
      )}
    </ScrollView>
  );
}

// ─── Account tab ──────────────────────────────────────────────────────────────

function AccountTab({ onLogout }: { onLogout: () => void }) {
  const { api, me, myProfile } = useAuth();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [sendingResetLink, setSendingResetLink] = useState(false);
  const [pwStatus, setPwStatus] = useState("");

  const handleChangePassword = useCallback(async () => {
    if (!currentPw.trim() || !newPw.trim()) return;
    if (newPw !== confirmPw) {
      setPwStatus("Passwords do not match.");
      return;
    }
    if (newPw.length < 8) {
      setPwStatus("Password must be at least 8 characters.");
      return;
    }
    setChangingPw(true);
    setPwStatus("");
    try {
      await api.changePassword(currentPw, newPw);
      setPwStatus("Password changed successfully!");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setShowChangePassword(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to change password.";
      setPwStatus(msg);
    } finally {
      setChangingPw(false);
    }
  }, [api, currentPw, newPw, confirmPw]);

  const confirmLogout = useCallback(() => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: onLogout },
    ]);
  }, [onLogout]);

  const handleSendResetLink = useCallback(async () => {
    const email = String(myProfile?.email || "").trim();
    if (!email) {
      setPwStatus("Email address unavailable.");
      return;
    }
    setSendingResetLink(true);
    setPwStatus("");
    try {
      await api.forgotPassword(email);
      setPwStatus("If the account exists, a password reset link has been sent.");
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Failed to send reset link.";
      try {
        const parsed = JSON.parse(raw);
        setPwStatus(typeof parsed?.error === "string" ? parsed.error : raw);
      } catch {
        setPwStatus(raw);
      }
    } finally {
      setSendingResetLink(false);
    }
  }, [api, myProfile?.email]);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Section title="Account Info">
        <SectionRow label="Username" value={`@${me?.username ?? ""}`} />
        <SectionRow label="Email" value={myProfile?.email ?? "—"} last />
      </Section>

      <Section title="Security">
        <SectionRow
          label="Change Password"
          onPress={() => setShowChangePassword((v) => !v)}
        />
        {showChangePassword && (
          <View style={styles.subSection}>
            <TextInput
              value={currentPw}
              onChangeText={setCurrentPw}
              style={styles.textInput}
              placeholder="Current password"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              autoCapitalize="none"
              editable={!changingPw}
            />
            <TextInput
              value={newPw}
              onChangeText={setNewPw}
              style={styles.textInput}
              placeholder="New password (min 8 chars)"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              autoCapitalize="none"
              editable={!changingPw}
            />
            <TextInput
              value={confirmPw}
              onChangeText={setConfirmPw}
              style={styles.textInput}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              autoCapitalize="none"
              editable={!changingPw}
            />
            {!!pwStatus && (
              <Text
                style={[
                  styles.formStatus,
                  pwStatus.includes("successfully")
                    ? styles.formStatusSuccess
                    : undefined,
                ]}
              >
                {pwStatus}
              </Text>
            )}
            <Pressable
              style={[styles.saveBtn, changingPw && styles.saveBtnDisabled]}
              onPress={handleChangePassword}
              disabled={changingPw}
            >
              {changingPw ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Update Password</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.saveBtn, sendingResetLink && styles.saveBtnDisabled]}
              onPress={handleSendResetLink}
              disabled={sendingResetLink}
            >
              {sendingResetLink ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Email Reset Link</Text>
              )}
            </Pressable>
          </View>
        )}
        <SectionRow label="Two-Factor Auth" value="Manage on web" last />
      </Section>

      <Section>
        <SectionRow label="Log Out" onPress={confirmLogout} danger last />
      </Section>
    </ScrollView>
  );
}

// ─── Sessions tab ─────────────────────────────────────────────────────────────

function SessionsTab() {
  const { api } = useAuth();

  const [sessions, setSessions] = useState<
    {
      id: string;
      device?: string;
      location?: string;
      lastActive?: string;
      current?: boolean;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await api.getSessions();
        setSessions(data.sessions ?? []);
      } catch {
        setStatus("Failed to load sessions.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handleRevoke = useCallback(
    (sessionId: string, isCurrent: boolean) => {
      if (isCurrent) {
        Alert.alert(
          "Revoke Session",
          "This is your current session. Revoking it will log you out.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Revoke",
              style: "destructive",
              onPress: async () => {
                try {
                  await api.revokeSession(sessionId);
                  setSessions((prev) => prev.filter((s) => s.id !== sessionId));
                } catch {
                  Alert.alert("Error", "Failed to revoke session.");
                }
              },
            },
          ],
        );
      } else {
        Alert.alert("Revoke Session", "Revoke this session?", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Revoke",
            style: "destructive",
            onPress: async () => {
              try {
                await api.revokeSession(sessionId);
                setSessions((prev) => prev.filter((s) => s.id !== sessionId));
                setStatus("Session revoked.");
              } catch {
                Alert.alert("Error", "Failed to revoke session.");
              }
            },
          },
        ]);
      }
    },
    [api],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.brand}
          colors={[colors.brand]}
        />
      }
    >
      {!!status && (
        <Text style={[styles.formStatus, styles.formStatusSuccess]}>
          {status}
        </Text>
      )}

      <Section title={`Active Sessions (${sessions.length})`}>
        {sessions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No sessions found</Text>
          </View>
        ) : (
          sessions.map((session, i) => (
            <View
              key={session.id}
              style={[
                styles.sessionRow,
                i < sessions.length - 1 && styles.sessionRowBorder,
              ]}
            >
              <View style={styles.sessionInfo}>
                <View style={styles.sessionTop}>
                  <Text style={styles.sessionDevice} numberOfLines={1}>
                    {session.device ?? "Unknown device"}
                  </Text>
                  {session.current && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  )}
                </View>
                {session.location ? (
                  <Text style={styles.sessionMeta} numberOfLines={1}>
                    📍 {session.location}
                  </Text>
                ) : null}
                <Text style={styles.sessionMeta}>
                  Last active: {formatSessionDate(session.lastActive)}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.revokeBtn,
                  pressed && styles.revokeBtnPressed,
                ]}
                onPress={() =>
                  handleRevoke(session.id, session.current ?? false)
                }
              >
                <Text style={styles.revokeBtnText}>Revoke</Text>
              </Pressable>
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const { me, myProfile, selfStatus } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  const statusOpt = STATUS_OPTIONS.find((o) => o.value === selfStatus);

  return (
    <ScreenBackground>
      <TopBar title="Settings" subtitle="Profile, presence, security, and sessions" />
      <View style={styles.container}>
        <SurfaceCard style={styles.headerCard}>
          <Avatar
            username={myProfile?.displayName ?? me?.username}
            pfpUrl={myProfile?.pfp_url}
            size={44}
            status={selfStatus}
            showStatus
          />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {myProfile?.displayName ?? me?.username ?? "Account"}
            </Text>
            <Text style={styles.headerStatus} numberOfLines={1}>
              {statusOpt?.emoji ?? "🟢"} {statusOpt?.label ?? "Online"}
            </Text>
          </View>
        </SurfaceCard>

        <TabBar active={activeTab} onChange={setActiveTab} />

        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "status" && <StatusTab />}
        {activeTab === "account" && <AccountTab onLogout={onLogout} />}
        {activeTab === "sessions" && <SessionsTab />}
      </View>
    </ScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.sm,
  },

  // Header
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    gap: spacing.md,
  },
  headerInfo: { flex: 1, minWidth: 0, gap: 2 },
  headerName: {
    ...typography.heading,
    color: colors.text,
  },
  headerStatus: {
    ...typography.caption,
    color: colors.textDim,
    textTransform: "capitalize",
  },

  // Tab content wrapper
  tabContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Avatar preview (profile tab)
  avatarPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.sidebar,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  avatarInfo: { flex: 1, gap: 4 },
  avatarUsername: {
    ...typography.heading,
    color: colors.text,
    fontWeight: "700",
  },
  avatarDisplayName: {
    ...typography.body,
    color: colors.textDim,
  },

  // Form fields
  inputGroup: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  inputGroupLast: { paddingBottom: spacing.md },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  inputHint: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: "right",
  },
  textInput: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  textInputMulti: {
    minHeight: 80,
    maxHeight: 160,
    textAlignVertical: "top",
  },

  // Sub-section (password change form)
  subSection: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  // Status options
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    minHeight: 48,
  },
  statusOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusOptionPressed: { backgroundColor: colors.hover },
  statusEmoji: { fontSize: 20, width: 28, textAlign: "center" },
  statusLabel: {
    ...typography.body,
    fontWeight: "600",
    flex: 1,
  },
  statusCheck: {
    fontSize: 18,
    color: colors.brand,
    fontWeight: "700",
  },

  // Buttons
  saveBtn: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    marginTop: spacing.xs,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryBtn: {
    minHeight: 42,
    marginTop: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elev,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },

  // Feedback
  formStatus: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
  formStatusSuccess: { color: colors.success },

  // Sessions
  sessionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.md,
    gap: spacing.md,
  },
  sessionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sessionInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  sessionTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sessionDevice: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
  },
  sessionMeta: {
    ...typography.caption,
    color: colors.textDim,
  },
  currentBadge: {
    backgroundColor: colors.brand,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    flexShrink: 0,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.4,
  },
  revokeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  revokeBtnPressed: {
    backgroundColor: "rgba(239,95,118,0.15)",
  },
  revokeBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },

  // Empty states
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyBox: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.textDim,
    textAlign: "center",
  },
});
