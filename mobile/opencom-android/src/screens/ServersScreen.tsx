import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  EmptyState,
  ScreenBackground,
  SectionLabel,
  StatusBanner,
  SurfaceCard,
  TopBar,
} from "../components/chrome";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/Avatar";
import type { Channel, CoreServer, Guild, VoiceState } from "../types";
import { colors, radii, spacing, typography } from "../theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServersScreenProps = {
  onSelectChannel: (server: CoreServer, guild: Guild, channel: Channel) => void;
  onViewInvites?: (server: CoreServer) => void;
  onViewMembers?: (server: CoreServer, guild: Guild) => void;
};

type CategorySection = {
  category: Channel | null;
  channels: Channel[];
  collapsed: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCategorySections(channels: Channel[]): CategorySection[] {
  const categories = channels
    .filter((c) => c.type === "category")
    .sort((a, b) => a.position - b.position);

  const textAndVoice = channels.filter(
    (c) => c.type === "text" || c.type === "voice",
  );

  // Channels without a parent go into an "uncategorized" section
  const uncategorized = textAndVoice
    .filter((c) => !c.parent_id)
    .sort((a, b) => a.position - b.position);

  const sections: CategorySection[] = [];

  if (uncategorized.length > 0) {
    sections.push({
      category: null,
      channels: uncategorized,
      collapsed: false,
    });
  }

  for (const cat of categories) {
    const children = textAndVoice
      .filter((c) => c.parent_id === cat.id)
      .sort((a, b) => a.position - b.position);
    if (children.length > 0) {
      sections.push({ category: cat, channels: children, collapsed: false });
    }
  }

  return sections;
}

function getVoiceCountForChannel(
  voiceStates: VoiceState[],
  channelId: string,
): number {
  return voiceStates.filter((vs) => vs.channelId === channelId).length;
}

// ─── Server pill ──────────────────────────────────────────────────────────────

function ServerPill({
  server,
  selected,
  onPress,
  onLongPress,
}: {
  server: CoreServer;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.serverPill,
        selected && styles.serverPillActive,
        pressed && styles.serverPillPressed,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View
        style={[
          styles.serverPillIconWrap,
          selected && styles.serverPillIconWrapActive,
        ]}
      >
        {server.logoUrl ? (
          <Image
            source={{ uri: server.logoUrl }}
            style={styles.serverPillIcon}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.serverPillIconFallback,
              selected && styles.serverPillIconFallbackActive,
            ]}
          >
            <Text style={styles.serverPillIconText} numberOfLines={1}>
              {server.name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text
        style={[styles.serverPillName, selected && styles.serverPillNameActive]}
        numberOfLines={1}
      >
        {server.name}
      </Text>
    </Pressable>
  );
}

// ─── Guild pill ───────────────────────────────────────────────────────────────

function GuildPill({
  guild,
  selected,
  onPress,
}: {
  guild: Guild;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.pill, selected && styles.pillActive]}
      onPress={onPress}
    >
      <Text
        style={[styles.pillText, selected && styles.pillTextActive]}
        numberOfLines={1}
      >
        {guild.name}
      </Text>
    </Pressable>
  );
}

// ─── Category header ──────────────────────────────────────────────────────────

function CategoryHeader({
  name,
  collapsed,
  onToggle,
}: {
  name: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.categoryHeader} onPress={onToggle}>
      <Text style={styles.categoryArrow}>{collapsed ? "▶" : "▼"}</Text>
      <Text style={styles.categoryName} numberOfLines={1}>
        {name.toUpperCase()}
      </Text>
    </Pressable>
  );
}

// ─── Channel row ─────────────────────────────────────────────────────────────

function ChannelRow({
  channel,
  voiceCount,
  voiceMembers,
  onPress,
}: {
  channel: Channel;
  voiceCount?: number;
  voiceMembers?: VoiceState[];
  onPress: () => void;
}) {
  const isVoice = channel.type === "voice";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.channelRow,
        pressed && styles.channelRowPressed,
      ]}
      onPress={onPress}
    >
      <Text style={styles.channelIcon}>{isVoice ? "🔊" : "#"}</Text>
      <Text style={styles.channelName} numberOfLines={1}>
        {channel.name}
      </Text>
      {isVoice && voiceCount != null && voiceCount > 0 ? (
        <View style={styles.voiceCountBadge}>
          <Text style={styles.voiceCountText}>{voiceCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Server header (banner + name) ───────────────────────────────────────────

function ServerHeader({
  server,
  onOptionsPress,
}: {
  server: CoreServer;
  onOptionsPress: () => void;
}) {
  return (
    <SurfaceCard style={styles.serverHeader} padded={false}>
      {server.bannerUrl ? (
        <Image
          source={{ uri: server.bannerUrl }}
          style={styles.serverBanner}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.serverHeaderContent}>
        {server.logoUrl ? (
          <Image
            source={{ uri: server.logoUrl }}
            style={styles.serverLogo}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.serverLogoFallback}>
            <Text style={styles.serverLogoFallbackText}>
              {server.name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.serverName} numberOfLines={1}>
          {server.name}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.serverOptionsBtn,
            pressed && styles.serverOptionsBtnPressed,
          ]}
          onPress={onOptionsPress}
          hitSlop={8}
        >
          <Text style={styles.serverOptionsBtnText}>⋯</Text>
        </Pressable>
      </View>
    </SurfaceCard>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function ServersScreen({
  onSelectChannel,
  onViewInvites,
  onViewMembers,
}: ServersScreenProps) {
  const { api, servers, refreshServers, me } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [status, setStatus] = useState("");

  const [selectedServerId, setSelectedServerId] = useState("");
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [voiceStates, setVoiceStates] = useState<VoiceState[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedServerId) ?? null,
    [servers, selectedServerId],
  );

  const selectedGuild = useMemo(
    () => guilds.find((g) => g.id === selectedGuildId) ?? null,
    [guilds, selectedGuildId],
  );

  const categorySections = useMemo(
    () => buildCategorySections(allChannels),
    [allChannels],
  );

  // ── Auto-select first server ───────────────────────────────────────────────

  useEffect(() => {
    if (servers.length === 0) {
      if (selectedServerId) setSelectedServerId("");
      return;
    }
    if (!servers.some((server) => server.id === selectedServerId)) {
      setSelectedServerId(servers[0].id);
    }
  }, [servers, selectedServerId]);

  // ── Load guilds when server changes ───────────────────────────────────────

  useEffect(() => {
    if (!selectedServer) {
      setGuilds([]);
      setSelectedGuildId("");
      setAllChannels([]);
      setVoiceStates([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const g = await api.listGuilds(selectedServer);
        if (!alive) return;
        const list = g ?? [];
        setGuilds(list);
        const preferred =
          list.find((x) => x.id === selectedGuildId)?.id ||
          selectedServer.defaultGuildId ||
          list[0]?.id ||
          "";
        setSelectedGuildId(preferred);
      } catch {
        if (alive) setStatus("Failed to load guilds.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedServer?.id]); // eslint-disable-line

  // ── Load channels when guild changes ──────────────────────────────────────

  useEffect(() => {
    if (!selectedServer || !selectedGuildId) {
      setAllChannels([]);
      setVoiceStates([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [stateData, voiceData] = await Promise.allSettled([
          api.getGuildState(selectedServer, selectedGuildId),
          api.getVoiceStates(selectedServer, selectedGuildId),
        ]);

        if (!alive) return;

        if (stateData.status === "fulfilled") {
          setAllChannels(stateData.value.channels ?? []);
        } else {
          setStatus("Failed to load channels.");
        }

        if (voiceData.status === "fulfilled") {
          setVoiceStates(voiceData.value.voiceStates ?? []);
        }
      } catch {
        if (alive) setStatus("Failed to load channels.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedServer?.id, selectedGuildId]); // eslint-disable-line

  // ── Load servers on mount ──────────────────────────────────────────────────

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      await refreshServers();
    } catch {
      setStatus("Failed to load servers.");
    } finally {
      setLoading(false);
    }
  }, [refreshServers]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ── Join invite ────────────────────────────────────────────────────────────

  const onJoinInvite = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code) return;
    setJoining(true);
    setStatus("");
    try {
      const joined = await api.joinInvite(code);
      await refreshServers();
      if (joined.serverId) setSelectedServerId(joined.serverId);
      setInviteCode("");
      setStatus("Successfully joined server!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invite join failed.";
      setStatus(msg);
    } finally {
      setJoining(false);
    }
  }, [api, inviteCode, refreshServers]);

  // ── Category collapse toggle ───────────────────────────────────────────────

  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  // ── Server options (long press / menu) ────────────────────────────────────

  const openServerOptions = useCallback(
    (server: CoreServer) => {
      const isOwner = server.roles?.includes("owner");

      if (Platform.OS === "ios") {
        const options: string[] = [];
        if (onViewInvites) options.push("Invites");
        if (selectedGuild && onViewMembers) options.push("Members");
        if (isOwner) options.push("Delete Server");
        else options.push("Leave Server");
        options.push("Cancel");

        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: server.name,
            options,
            destructiveButtonIndex: options.length - 2,
            cancelButtonIndex: options.length - 1,
          },
          (idx) => {
            const label = options[idx];
            if (label === "Invites") {
              onViewInvites?.(server);
            } else if (label === "Members" && selectedGuild) {
              onViewMembers?.(server, selectedGuild);
            } else if (label === "Leave Server") {
              confirmLeaveServer(server); // eslint-disable-line
            } else if (label === "Delete Server") {
              confirmDeleteServer(server); // eslint-disable-line
            }
          },
        );
      } else {
        const alertButtons: import("react-native").AlertButton[] = [];

        if (onViewInvites) {
          alertButtons.push({
            text: "Invites",
            onPress: () => onViewInvites(server),
          });
        }
        if (selectedGuild && onViewMembers) {
          alertButtons.push({
            text: "Members",
            onPress: () => onViewMembers!(server, selectedGuild),
          });
        }
        if (isOwner) {
          alertButtons.push({
            text: "Delete Server",
            style: "destructive",
            onPress: () => confirmDeleteServer(server), // eslint-disable-line
          });
        } else {
          alertButtons.push({
            text: "Leave Server",
            style: "destructive",
            onPress: () => confirmLeaveServer(server), // eslint-disable-line
          });
        }
        alertButtons.push({ text: "Cancel", style: "cancel" });

        Alert.alert(server.name, "Server options", alertButtons);
      }
    },
    [selectedGuild, onViewInvites, onViewMembers], // eslint-disable-line
  );

  const confirmLeaveServer = useCallback(
    (server: CoreServer) => {
      Alert.alert(
        "Leave Server",
        `Leave "${server.name}"? You'll need an invite to rejoin.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: async () => {
              try {
                await api.leaveServer(server.id);
                await refreshServers();
                if (selectedServerId === server.id) {
                  setSelectedServerId("");
                }
                setStatus(`Left "${server.name}".`);
              } catch {
                Alert.alert("Error", "Failed to leave server.");
              }
            },
          },
        ],
      );
    },
    [api, refreshServers, selectedServerId],
  );

  const confirmDeleteServer = useCallback(
    (server: CoreServer) => {
      Alert.alert(
        "Delete Server",
        `Permanently delete "${server.name}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await api.deleteServer(server.id);
                await refreshServers();
                if (selectedServerId === server.id) {
                  setSelectedServerId("");
                }
              } catch {
                Alert.alert("Error", "Failed to delete server.");
              }
            },
          },
        ],
      );
    },
    [api, refreshServers, selectedServerId],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ScreenBackground>
        <TopBar
          title="Servers"
          subtitle={me?.username ? `Loading spaces for @${me.username}` : "Loading your spaces"}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.subtle}>Loading servers…</Text>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <TopBar
        title="Servers"
        subtitle={
          me?.username
            ? `${servers.length} ${servers.length === 1 ? "server" : "servers"} for @${me.username}`
            : `${servers.length} connected servers`
        }
      />

      {servers.length === 0 ? (
        <View style={styles.emptyWrap}>
          <SurfaceCard style={styles.joinCard}>
            <SectionLabel title="Join a Server" />
            <Text style={styles.joinHint}>
              Enter an invite code to jump into a workspace.
            </Text>
            <View style={styles.inviteRow}>
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                style={styles.inviteInput}
                placeholder="Enter invite code"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!joining}
                returnKeyType="join"
                onSubmitEditing={onJoinInvite}
              />
              <Pressable
                style={[
                  styles.joinBtn,
                  (joining || !inviteCode.trim()) && styles.joinBtnDisabled,
                ]}
                onPress={onJoinInvite}
                disabled={joining || !inviteCode.trim()}
              >
                {joining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.joinBtnText}>Join</Text>
                )}
              </Pressable>
            </View>
          </SurfaceCard>
          <EmptyState
            eyebrow="SERVERS"
            icon="🏠"
            title="No servers yet"
            hint="Join a workspace with an invite code and it will appear here."
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SurfaceCard style={styles.joinCard}>
            <SectionLabel title="Quick Join" />
            <Text style={styles.joinHint}>
              Paste an invite code to add another server to your rail.
            </Text>
            <View style={styles.inviteRow}>
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                style={styles.inviteInput}
                placeholder="Invite code"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!joining}
                returnKeyType="join"
                onSubmitEditing={onJoinInvite}
              />
              <Pressable
                style={[
                  styles.joinBtn,
                  (joining || !inviteCode.trim()) && styles.joinBtnDisabled,
                ]}
                onPress={onJoinInvite}
                disabled={joining || !inviteCode.trim()}
              >
                {joining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.joinBtnText}>Join</Text>
                )}
              </Pressable>
            </View>
          </SurfaceCard>

          <View style={styles.sectionBlock}>
            <SectionLabel title="Server Rail" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {servers.map((server) => (
                <ServerPill
                  key={server.id}
                  server={server}
                  selected={selectedServerId === server.id}
                  onPress={() => setSelectedServerId(server.id)}
                  onLongPress={() => openServerOptions(server)}
                />
              ))}
            </ScrollView>
          </View>

          {selectedServer ? (
            <ServerHeader
              server={selectedServer}
              onOptionsPress={() => openServerOptions(selectedServer)}
            />
          ) : null}

          {selectedServer && guilds.length > 1 ? (
            <View style={styles.sectionBlock}>
              <SectionLabel title="Workspaces" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.guildRow}
              >
                {guilds.map((guild) => (
                  <GuildPill
                    key={guild.id}
                    guild={guild}
                    selected={selectedGuildId === guild.id}
                    onPress={() => setSelectedGuildId(guild.id)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {selectedServer && selectedGuild ? (
            <SurfaceCard style={styles.channelSurface} padded={false}>
              <View style={styles.channelListHeader}>
                <View style={styles.channelListMeta}>
                  <Text style={styles.sectionLabel}>CHANNELS</Text>
                  <Text style={styles.channelCount}>
                    {
                      allChannels.filter(
                        (entry) => entry.type === "text" || entry.type === "voice",
                      ).length
                    }{" "}
                    available
                  </Text>
                </View>
                <View style={styles.headerLinks}>
                  {onViewInvites ? (
                    <Pressable
                      onPress={() => onViewInvites(selectedServer)}
                      hitSlop={8}
                    >
                      <Text style={styles.membersLink}>Invites</Text>
                    </Pressable>
                  ) : null}
                  {onViewMembers ? (
                    <Pressable
                      onPress={() => onViewMembers(selectedServer, selectedGuild)}
                      hitSlop={8}
                    >
                      <Text style={styles.membersLink}>Members</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {categorySections.length === 0 ? (
                <View style={styles.emptyChannels}>
                  <Text style={styles.emptyChannelsText}>
                    No channels in this workspace.
                  </Text>
                </View>
              ) : (
                categorySections.map((section, index) => {
                  const key = section.category?.id ?? `uncategorized-${index}`;
                  const isCollapsed = section.category
                    ? collapsedCategories.has(section.category.id)
                    : false;

                  return (
                    <View key={key}>
                      {section.category ? (
                        <CategoryHeader
                          name={section.category.name}
                          collapsed={isCollapsed}
                          onToggle={() => toggleCategory(section.category!.id)}
                        />
                      ) : null}
                      {!isCollapsed &&
                        section.channels.map((channelEntry) => {
                          const voiceCount =
                            channelEntry.type === "voice"
                              ? getVoiceCountForChannel(voiceStates, channelEntry.id)
                              : 0;
                          const voiceMembers =
                            channelEntry.type === "voice"
                              ? voiceStates.filter(
                                  (voiceState) => voiceState.channelId === channelEntry.id,
                                )
                              : [];

                          return (
                            <ChannelRow
                              key={channelEntry.id}
                              channel={channelEntry}
                              voiceCount={voiceCount}
                              voiceMembers={voiceMembers}
                              onPress={() =>
                                onSelectChannel(
                                  selectedServer,
                                  selectedGuild,
                                  channelEntry,
                                )
                              }
                            />
                          );
                        })}
                    </View>
                  );
                })
              )}
            </SurfaceCard>
          ) : null}
        </ScrollView>
      )}

      {status ? <StatusBanner text={status} onDismiss={() => setStatus("")} /> : null}
    </ScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    justifyContent: "center",
    gap: spacing.sm,
  },
  joinCard: {
    gap: spacing.sm,
  },
  joinHint: {
    ...typography.body,
    color: colors.textDim,
    lineHeight: 22,
  },

  // Invite row
  inviteRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 14,
  },
  joinBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 56,
    minHeight: 38,
  },
  joinBtnDisabled: { opacity: 0.55 },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Scroll content
  scrollView: { flex: 1 },

  // Centered states
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  subtle: { color: colors.textDim, marginTop: spacing.sm },
  emptyIcon: { fontSize: 48 },
  empty: {
    ...typography.heading,
    color: colors.text,
    textAlign: "center",
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: "center",
  },

  // Section blocks
  sectionBlock: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.eyebrow,
    color: colors.textDim,
  },

  // Server pills (horizontal scroll)
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  serverPill: {
    width: 84,
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  serverPillActive: {
    transform: [{ translateY: -2 }],
  },
  serverPillPressed: { opacity: 0.8 },
  serverPillIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  serverPillIconWrapActive: {
    backgroundColor: colors.active,
    borderColor: colors.borderStrong,
  },
  serverPillIcon: {
    width: 54,
    height: 54,
    borderRadius: radii.md,
    backgroundColor: colors.elevStrong,
  },
  serverPillIconFallback: {
    width: 54,
    height: 54,
    borderRadius: radii.md,
    backgroundColor: colors.elevStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  serverPillIconFallbackActive: { backgroundColor: colors.brand },
  serverPillIconText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  serverPillName: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
  serverPillNameActive: { color: colors.text },

  // Guild pills
  guildRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pill: {
    backgroundColor: colors.panelAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "transparent",
  },
  pillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brandStrong,
  },
  pillText: {
    ...typography.caption,
    color: colors.textSoft,
    fontWeight: "600",
  },
  pillTextActive: { color: "#fff" },

  // Server header
  serverHeader: {
    overflow: "hidden",
  },
  serverBanner: {
    width: "100%",
    height: 96,
  },
  serverHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  serverLogo: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.elevStrong,
  },
  serverLogoFallback: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  serverLogoFallbackText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
  serverName: {
    ...typography.title,
    color: colors.text,
    flex: 1,
  },
  serverOptionsBtn: {
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  serverOptionsBtnPressed: { backgroundColor: colors.hover },
  serverOptionsBtnText: {
    fontSize: 20,
    color: colors.textDim,
    letterSpacing: 2,
    lineHeight: 22,
  },

  // Channel list
  channelSurface: {
    overflow: "hidden",
  },
  channelListHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  channelListMeta: {
    flex: 1,
    gap: 4,
  },
  channelCount: {
    ...typography.caption,
    color: colors.textDim,
  },
  headerLinks: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  membersLink: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: "600",
  },

  // Category header
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  categoryArrow: {
    fontSize: 9,
    color: colors.textDim,
    width: 12,
    textAlign: "center",
  },
  categoryName: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textDim,
    letterSpacing: 0.8,
    flex: 1,
  },

  // Channel row
  channelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    gap: spacing.xs,
  },
  channelRowPressed: { backgroundColor: colors.hover },
  channelIcon: {
    fontSize: 13,
    color: colors.textDim,
    width: 18,
    textAlign: "center",
  },
  channelName: {
    ...typography.body,
    color: colors.textSoft,
    flex: 1,
    fontSize: 14,
  },

  // Voice count badge
  voiceCountBadge: {
    backgroundColor: colors.success,
    borderRadius: radii.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  voiceCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },

  // Empty channels
  emptyChannels: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  emptyChannelsText: {
    ...typography.caption,
    color: colors.textDim,
    textAlign: "center",
  },
});
