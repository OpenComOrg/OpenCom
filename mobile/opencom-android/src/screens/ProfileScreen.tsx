import { useMemo } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Avatar } from "../components/Avatar";
import {
  ScreenBackground,
  SectionLabel,
  SurfaceCard,
  TopBar,
} from "../components/chrome";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing, typography } from "../theme";
import { resolveCoreImageUrl } from "../urls";

type ProfileScreenProps = {
  onLogout: () => void;
  onOpenSettings: (tab?: string) => void;
};

const STATUS_LABELS: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
  invisible: "Invisible",
};

function ActionRow({
  label,
  icon,
  onPress,
  danger = false,
  showDivider = false,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  danger?: boolean;
  showDivider?: boolean;
}) {
  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
        onPress={onPress}
      >
        <View style={[styles.actionIconWrap, danger && styles.actionIconWrapDanger]}>
          <Text style={styles.actionIcon}>{icon}</Text>
        </View>
        <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]}>
          {label}
        </Text>
        <Text style={styles.actionChevron}>›</Text>
      </Pressable>
      {showDivider ? <View style={styles.rowDivider} /> : null}
    </View>
  );
}

export function ProfileScreen({
  onLogout,
  onOpenSettings,
}: ProfileScreenProps) {
  const { me, myProfile, selfStatus } = useAuth();

  const displayName = myProfile?.displayName ?? me?.username ?? "User";
  const username = me?.username ?? "";
  const bio = myProfile?.bio ?? "";
  const pfpUrl = myProfile?.pfp_url ?? null;
  const bannerUrl = myProfile?.banner_url ?? null;
  const resolvedBannerUrl = resolveCoreImageUrl(bannerUrl);
  const statusLabel = STATUS_LABELS[selfStatus] ?? STATUS_LABELS.online;

  const profileSubtitle = useMemo(() => {
    if (bio) return bio;
    if (username) return `@${username}`;
    return "Your OpenCom profile";
  }, [bio, username]);

  return (
    <ScreenBackground>
      <TopBar title="Profile" subtitle="Identity, presence, and account tools" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SurfaceCard style={styles.heroCard} padded={false}>
          {resolvedBannerUrl ? (
            <Image
              source={{ uri: resolvedBannerUrl }}
              style={styles.banner}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.bannerPlaceholder} />
          )}

          <View style={styles.identityWrap}>
            <View style={styles.avatarWrap}>
              <Avatar
                username={displayName}
                pfpUrl={pfpUrl}
                size={84}
                status={selfStatus}
                showStatus
              />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.heroAction,
                pressed && styles.heroActionPressed,
              ]}
              onPress={() => onOpenSettings("profile")}
            >
              <Text style={styles.heroActionText}>Edit Profile</Text>
            </Pressable>
          </View>

          <View style={styles.heroBody}>
            <Text style={styles.displayName}>{displayName}</Text>
            {username ? <Text style={styles.username}>@{username}</Text> : null}
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusBadgeText}>{statusLabel}</Text>
            </View>
            <Text style={styles.profileSubtitle}>{profileSubtitle}</Text>
          </View>
        </SurfaceCard>

        {myProfile?.email ? (
          <SurfaceCard>
            <SectionLabel title="Account" />
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>EMAIL</Text>
                <Text style={styles.infoValue}>{myProfile.email}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>STATUS</Text>
                <Text style={styles.infoValue}>{statusLabel}</Text>
              </View>
            </View>
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={styles.listCard} padded={false}>
          <View style={styles.cardHeaderWrap}>
            <SectionLabel title="Quick Actions" />
          </View>
          <ActionRow
            icon="⚙️"
            label="Settings and Profile"
            onPress={() => onOpenSettings("profile")}
            showDivider
          />
          <ActionRow
            icon="⚡"
            label="Boost and Billing"
            onPress={() => onOpenSettings("billing")}
            showDivider
          />
          <ActionRow
            icon="🎨"
            label="Theme and Appearance"
            onPress={() => onOpenSettings("appearance")}
            showDivider
          />
          <ActionRow
            icon="🔒"
            label="Account and Security"
            onPress={() => onOpenSettings("account")}
            showDivider
          />
          <ActionRow
            icon="📱"
            label="Sessions and Devices"
            onPress={() => onOpenSettings("sessions")}
          />
        </SurfaceCard>

        <SurfaceCard style={styles.listCard} padded={false}>
          <View style={styles.cardHeaderWrap}>
            <SectionLabel title="Danger Zone" />
          </View>
          <ActionRow
            icon="🚪"
            label="Log Out"
            onPress={onLogout}
            danger
          />
        </SurfaceCard>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  heroCard: {
    overflow: "hidden",
  },
  banner: {
    width: "100%",
    height: 136,
  },
  bannerPlaceholder: {
    width: "100%",
    height: 112,
    backgroundColor: colors.panelAlt,
  },
  identityWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginTop: -42,
  },
  avatarWrap: {
    padding: 4,
    borderRadius: radii.full,
    backgroundColor: colors.background,
  },
  heroAction: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.brandMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  heroActionPressed: {
    opacity: 0.82,
  },
  heroActionText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "700",
  },
  heroBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  displayName: {
    ...typography.title,
    color: colors.text,
  },
  username: {
    ...typography.caption,
    color: colors.textDim,
  },
  statusBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusBadgeText: {
    ...typography.caption,
    color: colors.textSoft,
    fontWeight: "700",
  },
  profileSubtitle: {
    ...typography.body,
    color: colors.textSoft,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  infoGrid: {
    gap: spacing.md,
  },
  infoItem: {
    gap: spacing.xs,
  },
  infoLabel: {
    ...typography.eyebrow,
    color: colors.textDim,
  },
  infoValue: {
    ...typography.body,
    color: colors.text,
  },
  listCard: {
    overflow: "hidden",
  },
  cardHeaderWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionRowPressed: {
    backgroundColor: colors.hover,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandMuted,
  },
  actionIconWrapDanger: {
    backgroundColor: "rgba(239, 95, 118, 0.14)",
  },
  actionIcon: {
    fontSize: 16,
  },
  actionLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  actionLabelDanger: {
    color: colors.danger,
  },
  actionChevron: {
    fontSize: 20,
    color: colors.textDim,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 54,
    marginRight: spacing.lg,
  },
});
