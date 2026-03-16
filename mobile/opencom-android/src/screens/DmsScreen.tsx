import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Avatar } from "../components/Avatar";
import {
  EmptyState,
  ScreenBackground,
  SectionLabel,
  StatusBanner,
  SurfaceCard,
  TopBar,
} from "../components/chrome";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing, typography } from "../theme";
import type { DmThreadApi } from "../types";

type DmsScreenProps = {
  onSelectDm: (thread: DmThreadApi) => void;
};

function formatLastTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMinutes = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function DmsScreen({ onSelectDm }: DmsScreenProps) {
  const {
    api,
    presenceByUserId,
    dmThreads,
    dmMessages,
    setDmThreads,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const loadDms = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setStatus("");
      try {
        const data = await api.getDms();
        setDmThreads((data.dms ?? []) as DmThreadApi[]);
      } catch {
        setStatus("Failed to load messages.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, setDmThreads],
  );

  useEffect(() => {
    loadDms();
  }, [loadDms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDms(true);
  }, [loadDms]);

  const onlineThreads = useMemo(
    () =>
      dmThreads.filter((thread) => {
        const statusValue = presenceByUserId[thread.participantId]?.status;
        return statusValue && statusValue !== "offline" && statusValue !== "invisible";
      }),
    [dmThreads, presenceByUserId],
  );

  if (loading) {
    return (
      <ScreenBackground>
        <TopBar title="Messages" subtitle="Loading your conversations" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Syncing recent direct messages…</Text>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <TopBar
        title="Messages"
        subtitle={`${dmThreads.length} direct ${dmThreads.length === 1 ? "message" : "messages"} ready`}
      />

      {dmThreads.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            eyebrow="DIRECT MESSAGES"
            icon="💬"
            title="No direct messages yet"
            hint="Add friends from the Friends tab and your conversations will appear here."
          />
        </View>
      ) : (
        <FlatList
          data={dmThreads}
          keyExtractor={(thread) => thread.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerStack}>
              <SurfaceCard style={styles.summaryCard}>
                <Text style={styles.summaryEyebrow}>DIRECT MESSAGES</Text>
                <Text style={styles.summaryTitle}>Your recent conversations</Text>
                <Text style={styles.summaryBody}>
                  Pick up where you left off or jump into an active chat.
                </Text>

                {onlineThreads.length > 0 ? (
                  <View style={styles.activeStrip}>
                    {onlineThreads.slice(0, 4).map((thread) => (
                      <Pressable
                        key={`active-${thread.id}`}
                        style={({ pressed }) => [
                          styles.activeChip,
                          pressed && styles.activeChipPressed,
                        ]}
                        onPress={() => onSelectDm(thread)}
                      >
                        <Avatar
                          username={thread.name}
                          pfpUrl={thread.pfp_url}
                          size={30}
                          status={presenceByUserId[thread.participantId]?.status}
                          showStatus
                        />
                        <Text style={styles.activeChipLabel} numberOfLines={1}>
                          {thread.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </SurfaceCard>

              <SectionLabel title="Recent Threads" />
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const latestCachedMessage = dmMessages[item.id]?.[0];
            const previewSource =
              item.lastMessageContent ?? latestCachedMessage?.content ?? null;
            const previewTimestamp =
              item.lastMessageAt ?? latestCachedMessage?.createdAt ?? null;
            const presence = presenceByUserId[item.participantId];
            const preview = previewSource
              ? previewSource.length > 72
                ? previewSource.slice(0, 72) + "…"
                : previewSource
              : presence?.customStatus || presence?.status || "No messages yet";

            return (
              <SurfaceCard style={styles.threadCard} padded={false}>
                <Pressable
                  style={({ pressed }) => [
                    styles.threadRow,
                    pressed && styles.threadRowPressed,
                  ]}
                  onPress={() => onSelectDm(item)}
                >
                  <Avatar
                    username={item.name}
                    pfpUrl={item.pfp_url}
                    size={48}
                    status={presence?.status}
                    showStatus
                  />
                  <View style={styles.threadInfo}>
                    <View style={styles.threadTop}>
                      <Text style={styles.threadName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.threadTime}>
                        {formatLastTime(previewTimestamp)}
                      </Text>
                    </View>
                    <Text style={styles.threadPreview} numberOfLines={2}>
                      {preview}
                    </Text>
                  </View>
                  <View style={styles.threadChevronWrap}>
                    <Text style={styles.threadChevron}>›</Text>
                  </View>
                </Pressable>
              </SurfaceCard>
            );
          }}
        />
      )}

      {status ? <StatusBanner text={status} onDismiss={() => setStatus("")} /> : null}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.body,
    color: colors.textDim,
    textAlign: "center",
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerStack: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  summaryEyebrow: {
    ...typography.eyebrow,
    color: colors.textDim,
  },
  summaryTitle: {
    ...typography.title,
    color: colors.text,
  },
  summaryBody: {
    ...typography.body,
    color: colors.textDim,
    lineHeight: 22,
  },
  activeStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  activeChip: {
    minWidth: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeChipPressed: {
    backgroundColor: colors.hover,
  },
  activeChipLabel: {
    ...typography.caption,
    color: colors.textSoft,
    fontWeight: "700",
    flex: 1,
  },
  threadCard: {
    overflow: "hidden",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  threadRowPressed: {
    backgroundColor: colors.hover,
  },
  threadInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  threadTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  threadName: {
    ...typography.heading,
    color: colors.text,
    flex: 1,
  },
  threadTime: {
    ...typography.label,
    color: colors.textDim,
  },
  threadPreview: {
    ...typography.caption,
    color: colors.textSoft,
    lineHeight: 18,
  },
  threadChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandMuted,
  },
  threadChevron: {
    fontSize: 20,
    color: colors.text,
    lineHeight: 22,
  },
});
