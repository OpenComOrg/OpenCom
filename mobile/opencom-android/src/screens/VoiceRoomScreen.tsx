import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ScreenBackground,
  StatusBanner,
  SurfaceCard,
  TopBar,
} from "../components/chrome";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { httpToNodeGatewayWs, useNodeGateway } from "../hooks/useGateway";
import type {
  Channel,
  CoreServer,
  Guild,
  VoiceProducerInfo,
  VoiceState,
} from "../types";
import { colors, radii, spacing, typography } from "../theme";
import { normalizeServerBaseUrl } from "../urls";

type VoiceRoomScreenProps = {
  server?: CoreServer;
  guild: Guild;
  channel: Channel;
  mode?: "server" | "private";
  membershipToken?: string | null;
  nodeBaseUrl?: string | null;
  callId?: string;
  participantName?: string | null;
  onBack: () => void;
};

function createRequestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function upsertVoiceState(list: VoiceState[], next: VoiceState) {
  const index = list.findIndex((entry) => entry.userId === next.userId);
  if (index === -1) return [...list, next];
  const updated = [...list];
  updated[index] = { ...updated[index], ...next };
  return updated;
}

function upsertProducer(list: VoiceProducerInfo[], next: VoiceProducerInfo) {
  const index = list.findIndex((entry) => entry.producerId === next.producerId);
  if (index === -1) return [...list, next];
  const updated = [...list];
  updated[index] = next;
  return updated;
}

export function VoiceRoomScreen({
  server,
  guild,
  channel,
  mode = "server",
  membershipToken,
  nodeBaseUrl,
  callId,
  participantName,
  onBack,
}: VoiceRoomScreenProps) {
  const { api, me } = useAuth();
  const isPrivateCall = mode === "private" || !!callId;
  const resolvedBaseUrl = String(
    normalizeServerBaseUrl(nodeBaseUrl || server?.baseUrl || "") ||
      nodeBaseUrl ||
      server?.baseUrl ||
      "",
  ).trim();
  const resolvedMembershipToken = String(
    membershipToken || server?.membershipToken || "",
  ).trim();
  const gatewayWsUrl = httpToNodeGatewayWs(resolvedBaseUrl);
  const voiceServer: CoreServer | null = resolvedBaseUrl && resolvedMembershipToken
    ? {
        id: server?.id || "private-call",
        name: server?.name || "Private Call",
        baseUrl: resolvedBaseUrl,
        membershipToken: resolvedMembershipToken,
      }
    : null;

  const [voiceStates, setVoiceStates] = useState<VoiceState[]>([]);
  const [producers, setProducers] = useState<VoiceProducerInfo[]>([]);
  const [status, setStatus] = useState("");
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [joining, setJoining] = useState(false);
  const [ending, setEnding] = useState(false);
  const [keepConnected, setKeepConnected] = useState(true);
  const lastJoinRequestIdRef = useRef("");

  const joined = voiceStates.some((entry) => entry.userId === me?.id);
  const voiceMembers = voiceStates
    .slice()
    .sort((a, b) => {
      if (a.userId === me?.id) return -1;
      if (b.userId === me?.id) return 1;
      return String(a.username || a.userId).localeCompare(
        String(b.username || b.userId),
      );
    });

  const producerSummaryByUserId = new Map<
    string,
    { screenCount: number; cameraCount: number; microphoneCount: number }
  >();
  for (const producer of producers) {
    const current = producerSummaryByUserId.get(producer.userId) || {
      screenCount: 0,
      cameraCount: 0,
      microphoneCount: 0,
    };
    if (producer.source === "screen") current.screenCount += 1;
    else if (producer.source === "camera") current.cameraCount += 1;
    else current.microphoneCount += 1;
    producerSummaryByUserId.set(producer.userId, current);
  }

  const loadVoiceStates = useCallback(async () => {
    if (!voiceServer) {
      setLoadingRoster(false);
      setStatus("Voice gateway details are missing for this room.");
      return;
    }

    try {
      const data = await api.getVoiceStates(voiceServer, guild.id);
      const nextStates = (data.voiceStates ?? []).filter(
        (entry) => entry.channelId === channel.id,
      );
      setVoiceStates(nextStates);
    } catch {
      setStatus("Could not load the live room roster.");
    } finally {
      setLoadingRoster(false);
    }
  }, [api, channel.id, guild.id, voiceServer]);

  const gateway = useNodeGateway({
    wsUrl: gatewayWsUrl,
    membershipToken: resolvedMembershipToken || null,
    guildId: guild.id,
    channelId: channel.id,
    enabled: !!resolvedMembershipToken && !!gatewayWsUrl,
    onEvent: useCallback(
      (event) => {
        switch (event.type) {
          case "VOICE_STATE_UPDATE":
            if (event.guildId !== guild.id) return;
            if (event.channelId === channel.id) {
              setVoiceStates((current) =>
                upsertVoiceState(current, {
                  userId: event.userId,
                  username: event.username,
                  pfp_url: event.pfp_url,
                  guildId: event.guildId,
                  channelId: channel.id,
                  muted: event.muted,
                  deafened: event.deafened,
                  speaking:
                    current.find((entry) => entry.userId === event.userId)
                      ?.speaking ?? false,
                }),
              );
            } else {
              setVoiceStates((current) =>
                current.filter((entry) => entry.userId !== event.userId),
              );
              setProducers((current) =>
                current.filter((entry) => entry.userId !== event.userId),
              );
            }
            break;
          case "VOICE_SPEAKING":
            if (event.guildId !== guild.id || event.channelId !== channel.id) return;
            setVoiceStates((current) =>
              current.map((entry) =>
                entry.userId === event.userId
                  ? { ...entry, speaking: event.speaking }
                  : entry,
              ),
            );
            break;
          case "VOICE_JOINED":
            if (event.guildId !== guild.id || event.channelId !== channel.id) return;
            setJoining(false);
            setStatus(
              isPrivateCall
                ? "Connected to the private call on mobile."
                : "Connected to the live voice room on mobile.",
            );
            setProducers(event.producers);
            loadVoiceStates().catch(() => {});
            break;
          case "VOICE_LEFT":
            setJoining(false);
            setVoiceStates((current) =>
              current.filter((entry) => entry.userId !== me?.id),
            );
            setProducers((current) =>
              current.filter((entry) => entry.userId !== me?.id),
            );
            setStatus("Left the voice room on this device.");
            break;
          case "VOICE_NEW_PRODUCER":
            if (event.guildId !== guild.id || event.channelId !== channel.id) return;
            setProducers((current) =>
              upsertProducer(current, {
                producerId: event.producerId,
                userId: event.userId,
                source: event.source,
              }),
            );
            break;
          case "VOICE_PRODUCER_CLOSED":
            if (event.guildId !== guild.id || event.channelId !== channel.id) return;
            setProducers((current) =>
              current.filter((entry) => entry.producerId !== event.producerId),
            );
            break;
          case "VOICE_USER_LEFT":
            if (event.guildId !== guild.id || event.channelId !== channel.id) return;
            setProducers((current) =>
              current.filter((entry) => entry.userId !== event.userId),
            );
            break;
          case "VOICE_ERROR":
            if (
              event.requestId &&
              lastJoinRequestIdRef.current &&
              event.requestId === lastJoinRequestIdRef.current
            ) {
              setJoining(false);
            }
            setStatus(event.details || event.error || "Voice room error.");
            break;
          default:
            break;
        }
      },
      [
        channel.id,
        guild.id,
        isPrivateCall,
        loadVoiceStates,
        me?.id,
      ],
    ),
  });

  const joinVoiceRoom = useCallback(
    (reason: "auto" | "manual" = "manual") => {
      if (!resolvedMembershipToken || !gatewayWsUrl) {
        setStatus("Voice gateway details are missing for this room.");
        return false;
      }
      if (joining) return false;

      const requestId = createRequestId("voice-join");
      lastJoinRequestIdRef.current = requestId;
      setKeepConnected(true);
      setJoining(true);
      setStatus(
        reason === "auto"
          ? "Connecting you to the live room..."
          : "Joining the live room...",
      );
      const sent = gateway.sendDispatch("VOICE_JOIN", {
        guildId: guild.id,
        channelId: channel.id,
        requestId,
      });
      if (!sent) {
        setJoining(false);
        setStatus("Voice gateway is still connecting. Try again in a moment.");
      }
      return sent;
    },
    [
      channel.id,
      gateway,
      gatewayWsUrl,
      guild.id,
      joining,
      resolvedMembershipToken,
    ],
  );

  const leaveVoiceRoom = useCallback(() => {
    setKeepConnected(false);
    setJoining(false);
    const left = gateway.sendDispatch("VOICE_LEAVE", {
      guildId: guild.id,
      channelId: channel.id,
    });
    if (!left) {
      setVoiceStates((current) =>
        current.filter((entry) => entry.userId !== me?.id),
      );
      setProducers((current) =>
        current.filter((entry) => entry.userId !== me?.id),
      );
      setStatus("Left the voice room on this device.");
    }
  }, [channel.id, gateway, guild.id, me?.id]);

  const endPrivateCall = useCallback(async () => {
    if (!callId || ending) return;
    setEnding(true);
    try {
      await api.endPrivateCall(callId);
      setStatus("Call ended.");
      setTimeout(() => onBack(), 150);
    } catch {
      setStatus("Could not end this call right now.");
    } finally {
      setEnding(false);
    }
  }, [api, callId, ending, onBack]);

  useEffect(() => {
    setLoadingRoster(true);
    setVoiceStates([]);
    setProducers([]);
    loadVoiceStates();
  }, [loadVoiceStates]);

  useEffect(() => {
    if (!gateway.ready || !keepConnected || joined || joining) return;
    const sent = joinVoiceRoom("auto");
    if (!sent) {
      setJoining(false);
      setStatus("Waiting for the voice gateway to finish connecting.");
    }
  }, [gateway.ready, joinVoiceRoom, joined, joining, keepConnected]);

  useEffect(() => {
    if (!isPrivateCall || !callId) return;
    const timer = setInterval(() => {
      api
        .getPrivateCallStatus(callId)
        .then((data) => {
          if (data.active === false) {
            setKeepConnected(false);
            setJoining(false);
            setStatus("This call has ended.");
          }
        })
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
  }, [api, callId, isPrivateCall]);

  const screenShareCount = producers.filter(
    (entry) => entry.source === "screen",
  ).length;
  const cameraCount = producers.filter(
    (entry) => entry.source === "camera",
  ).length;
  const speakingCount = voiceStates.filter((entry) => entry.speaking).length;

  return (
    <ScreenBackground>
      <TopBar
        title={isPrivateCall ? participantName || "Private Call" : channel.name}
        subtitle={
          isPrivateCall
            ? `${voiceMembers.length || 0} people connected`
            : `${channel.name} in ${guild.name}`
        }
        onBack={onBack}
        right={
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => loadVoiceStates()}
              style={styles.headerBtn}
              hitSlop={8}
            >
              <Text style={styles.headerBtnText}>↻</Text>
            </Pressable>
            {isPrivateCall ? (
              <Pressable
                onPress={endPrivateCall}
                style={[styles.headerBtn, styles.headerBtnDanger]}
                hitSlop={8}
                disabled={ending}
              >
                <Text style={styles.headerBtnText}>
                  {ending ? "…" : "✕"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <SurfaceCard style={styles.hero}>
          <Text style={styles.eyebrow}>
            {isPrivateCall ? "PRIVATE CALL" : "LIVE VOICE"}
          </Text>
          <Text style={styles.heroTitle}>
            {joined
              ? "You are connected on mobile"
              : gateway.ready
                ? "Ready to join this room"
                : "Connecting to the voice gateway"}
          </Text>
          <Text style={styles.heroText}>
            Mobile now joins the live room, tracks the roster, and shows active
            screen-share and camera publishers. Native media playback is still
            being finished separately, so this screen focuses on reliable room
            presence first.
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Members</Text>
              <Text style={styles.summaryValue}>{voiceMembers.length}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Speaking</Text>
              <Text style={styles.summaryValue}>{speakingCount}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Shares</Text>
              <Text style={styles.summaryValue}>{screenShareCount}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryLabel}>Cameras</Text>
              <Text style={styles.summaryValue}>{cameraCount}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            {!joined ? (
              <Pressable
                style={[
                  styles.primaryAction,
                  (joining || !gateway.ready) && styles.actionDisabled,
                ]}
                onPress={() => joinVoiceRoom("manual")}
                disabled={joining || !gateway.ready}
              >
                {joining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryActionText}>Join room</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={styles.secondaryAction}
                onPress={leaveVoiceRoom}
              >
                <Text style={styles.secondaryActionText}>Leave room</Text>
              </Pressable>
            )}

            {isPrivateCall ? (
              <Pressable
                style={[
                  styles.dangerAction,
                  ending && styles.actionDisabled,
                ]}
                onPress={endPrivateCall}
                disabled={ending}
              >
                <Text style={styles.dangerActionText}>
                  {ending ? "Ending..." : "Hang up"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </SurfaceCard>

        {status ? (
          <StatusBanner text={status} onDismiss={() => setStatus("")} />
        ) : null}

        <SurfaceCard style={styles.gatewayCard}>
          <Text style={styles.sectionTitle}>Connection</Text>
          <View style={styles.connectionRow}>
            <View style={styles.connectionPill}>
              <Text style={styles.connectionLabel}>Gateway</Text>
              <Text style={styles.connectionValue}>
                {gateway.connected ? "Connected" : "Offline"}
              </Text>
            </View>
            <View style={styles.connectionPill}>
              <Text style={styles.connectionLabel}>Room state</Text>
              <Text style={styles.connectionValue}>
                {joined ? "Joined" : joining ? "Joining" : "Idle"}
              </Text>
            </View>
          </View>
        </SurfaceCard>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Live roster</Text>
          {loadingRoster ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : null}
        </View>

        {voiceMembers.length === 0 && !loadingRoster ? (
          <SurfaceCard>
            <Text style={styles.emptyText}>
              No one is in this room yet.
            </Text>
          </SurfaceCard>
        ) : null}

        {voiceMembers.map((member) => {
          const producerSummary = producerSummaryByUserId.get(member.userId) || {
            screenCount: 0,
            cameraCount: 0,
            microphoneCount: 0,
          };
          const isSelf = member.userId === me?.id;
          return (
            <SurfaceCard key={member.userId} style={styles.memberCard}>
              <View style={styles.memberRow}>
                <Avatar
                  username={member.username}
                  pfpUrl={member.pfp_url}
                  size={44}
                  showStatus={false}
                />
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.username || member.userId}
                    {isSelf ? " (You)" : ""}
                  </Text>
                  <Text style={styles.memberState}>
                    {member.speaking
                      ? "Speaking now"
                      : member.deafened
                        ? "Deafened"
                        : member.muted
                          ? "Muted"
                          : "Listening"}
                  </Text>
                </View>
                <View style={styles.badges}>
                  {producerSummary.screenCount > 0 ? (
                    <View style={[styles.badge, styles.badgeScreen]}>
                      <Text style={styles.badgeText}>Screen</Text>
                    </View>
                  ) : null}
                  {producerSummary.cameraCount > 0 ? (
                    <View style={[styles.badge, styles.badgeCamera]}>
                      <Text style={styles.badgeText}>Camera</Text>
                    </View>
                  ) : null}
                  {member.speaking ? <View style={styles.speakingDot} /> : null}
                </View>
              </View>
            </SurfaceCard>
          );
        })}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  headerBtn: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: radii.full,
    backgroundColor: colors.elev,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerBtnDanger: {
    borderColor: "rgba(239, 95, 118, 0.4)",
  },
  headerBtnText: {
    color: colors.text,
    fontWeight: "700",
  },
  hero: {
    gap: spacing.md,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.brand,
  },
  heroTitle: {
    ...typography.hero,
    color: colors.text,
  },
  heroText: {
    ...typography.body,
    color: colors.textDim,
    lineHeight: 22,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  summaryPill: {
    minWidth: 94,
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.elev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textDim,
  },
  summaryValue: {
    ...typography.heading,
    color: colors.text,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  primaryAction: {
    minWidth: 140,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryAction: {
    minWidth: 140,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.elev,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: colors.text,
    fontWeight: "700",
  },
  dangerAction: {
    minWidth: 140,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    backgroundColor: "rgba(239, 95, 118, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(239, 95, 118, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerActionText: {
    color: colors.danger,
    fontWeight: "700",
  },
  actionDisabled: {
    opacity: 0.55,
  },
  gatewayCard: {
    gap: spacing.md,
  },
  connectionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  connectionPill: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.elev,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectionLabel: {
    ...typography.caption,
    color: colors.textDim,
  },
  connectionValue: {
    ...typography.heading,
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  emptyText: {
    ...typography.body,
    color: colors.textDim,
    textAlign: "center",
  },
  memberCard: {
    padding: spacing.md,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberName: {
    ...typography.body,
    color: colors.text,
    fontWeight: "700",
  },
  memberState: {
    ...typography.caption,
    color: colors.textDim,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  badgeScreen: {
    backgroundColor: "rgba(115, 134, 255, 0.16)",
    borderColor: "rgba(115, 134, 255, 0.34)",
  },
  badgeCamera: {
    backgroundColor: "rgba(55, 205, 147, 0.16)",
    borderColor: "rgba(55, 205, 147, 0.34)",
  },
  badgeText: {
    ...typography.label,
    color: colors.text,
  },
  speakingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
});
