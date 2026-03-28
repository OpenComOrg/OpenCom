import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, shadows, spacing, typography, useTheme } from "../theme";

type ScreenBackgroundProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type SurfaceCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
};

type TopBarProps = {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
  compact?: boolean;
};

type SectionLabelProps = {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

type SegmentOption = {
  value: string;
  label: string;
};

type SegmentedControlProps = {
  value: string;
  onChange: (value: string) => void;
  options: SegmentOption[];
  style?: StyleProp<ViewStyle>;
};

type EmptyStateProps = {
  eyebrow?: string;
  icon?: string;
  title: string;
  hint?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

type StatusBannerProps = {
  text: string;
  onDismiss?: () => void;
  tone?: "neutral" | "success" | "danger";
};

const TAB_META: Record<string, { label: string; icon: string }> = {
  Servers: { label: "Servers", icon: "🏠" },
  DMs: { label: "Messages", icon: "💬" },
  Friends: { label: "Friends", icon: "👥" },
  Profile: { label: "Profile", icon: "🪪" },
};

export function ScreenBackground({
  children,
  style,
}: ScreenBackgroundProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }, style]}>
      <View
        pointerEvents="none"
        style={[styles.backdrop, { backgroundColor: colors.backgroundDeep }]}
      >
        <View
          style={[
            styles.orb,
            styles.orbOne,
            { backgroundColor: colors.brandGlow },
          ]}
        />
        <View
          style={[
            styles.orb,
            styles.orbTwo,
            { backgroundColor: colors.brandMuted },
          ]}
        />
        <View
          style={[
            styles.orb,
            styles.orbThree,
            { backgroundColor: colors.hover },
          ]}
        />
      </View>
      {children}
    </View>
  );
}

export function SurfaceCard({
  children,
  style,
  padded = true,
}: SurfaceCardProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.panel,
          borderColor: colors.border,
        },
        padded && styles.cardPadded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function TopBar({
  title,
  subtitle,
  leading,
  onBack,
  right,
  compact = false,
}: TopBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <View
      style={[
        styles.topBar,
        { paddingTop: insets.top + (compact ? spacing.sm : spacing.md) },
      ]}
    >
      <View style={styles.topBarMain}>
        {onBack ? (
          <Pressable
            style={({ pressed }) => [
              styles.topBarButton,
              {
                backgroundColor: colors.brandMuted,
                borderColor: colors.border,
              },
              pressed && styles.topBarButtonPressed,
            ]}
            onPress={onBack}
          >
            <Text style={[styles.topBarButtonText, { color: colors.text }]}>
              ←
            </Text>
          </Pressable>
        ) : null}
        {leading ? <View style={styles.topBarLeading}>{leading}</View> : null}
        <View style={styles.topBarText}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.topBarSubtitle, { color: colors.textDim }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.topBarRight}>{right}</View> : null}
      </View>
    </View>
  );
}

export function SectionLabel({
  title,
  actionLabel,
  onActionPress,
}: SectionLabelProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabel, { color: colors.textDim }]}>
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress}>
          <Text style={[styles.sectionAction, { color: colors.brand }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SegmentedControl({
  value,
  onChange,
  options,
  style,
}: SegmentedControlProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <View
      style={[
        styles.segmented,
        {
          backgroundColor: colors.sidebarStrong,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={({ pressed }) => [
              styles.segment,
              active && {
                backgroundColor: colors.active,
              },
              pressed && styles.segmentPressed,
            ]}
            onPress={() => onChange(option.value)}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? colors.text : colors.textDim },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({
  eyebrow,
  icon,
  title,
  hint,
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  return (
    <SurfaceCard style={styles.emptyCard}>
      {eyebrow ? (
        <Text style={[styles.emptyEyebrow, { color: colors.brand }]}>{eyebrow}</Text>
      ) : null}
      {icon ? <Text style={styles.emptyIcon}>{icon}</Text> : null}
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {hint ? <Text style={[styles.emptyHint, { color: colors.textDim }]}>{hint}</Text> : null}
      {actionLabel && onActionPress ? (
        <Pressable
          style={({ pressed }) => [
            styles.inlineAction,
            {
              backgroundColor: colors.brandMuted,
              borderColor: colors.border,
            },
            pressed && styles.inlineActionPressed,
          ]}
          onPress={onActionPress}
        >
          <Text style={[styles.inlineActionText, { color: colors.text }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </SurfaceCard>
  );
}

export function StatusBanner({
  text,
  onDismiss,
  tone = "neutral",
}: StatusBannerProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const textStyle: StyleProp<TextStyle> =
    tone === "success"
      ? [styles.statusSuccess, { color: colors.success }]
      : tone === "danger"
        ? [styles.statusDanger, { color: colors.danger }]
        : null;

  return (
    <View
      style={[
        styles.statusBanner,
        {
          backgroundColor: colors.sidebar,
          borderColor: colors.border,
        },
        tone === "success"
          ? { backgroundColor: colors.brandMuted }
          : tone === "danger"
            ? { backgroundColor: "rgba(239,95,118,0.12)" }
            : null,
      ]}
    >
      <Text
        style={[styles.statusText, { color: colors.text }, textStyle]}
        numberOfLines={2}
      >
        {text}
      </Text>
      {onDismiss ? (
        <Pressable
          style={({ pressed }) => [
            styles.statusDismiss,
            pressed && styles.statusDismissPressed,
          ]}
          onPress={onDismiss}
        >
          <Text style={[styles.statusDismissText, { color: colors.textDim }]}>
            ✕
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme.colors;

  return (
    <View
      style={[
        styles.tabBarWrap,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
      ]}
    >
      <View
        style={[
          styles.tabBarPanel,
          {
            backgroundColor: colors.panel,
            borderColor: colors.border,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const descriptor = descriptors[route.key];
          const meta = TAB_META[route.name] ?? {
            label:
              typeof descriptor.options.tabBarLabel === "string"
                ? descriptor.options.tabBarLabel
                : descriptor.options.title || route.name,
            icon: "•",
          };

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.tabItem,
                focused && [styles.tabItemActive, { backgroundColor: colors.active }],
                pressed && styles.tabItemPressed,
              ]}
            >
              <View
                style={[
                  styles.tabIcon,
                  focused && [styles.tabIconActive, { backgroundColor: colors.brandMuted }],
                ]}
              >
                <Text style={[styles.tabIconText, { color: colors.text }]}>
                  {meta.icon}
                </Text>
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: focused ? colors.text : colors.textDim },
                  focused && styles.tabLabelActive,
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  orb: {
    position: "absolute",
    borderRadius: 9999,
  },
  orbOne: {
    width: 300,
    height: 300,
    top: -120,
    left: -110,
    backgroundColor: colors.brandGlow,
    opacity: 0.42,
  },
  orbTwo: {
    width: 240,
    height: 240,
    top: 120,
    right: -80,
    backgroundColor: "rgba(74, 105, 188, 0.18)",
    opacity: 0.7,
  },
  orbThree: {
    width: 320,
    height: 320,
    bottom: -150,
    left: "20%",
    backgroundColor: "rgba(28, 50, 96, 0.28)",
    opacity: 0.9,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardPadded: {
    padding: spacing.lg,
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  topBarMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 54,
  },
  topBarButton: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarButtonPressed: {
    backgroundColor: colors.hover,
  },
  topBarButtonText: {
    fontSize: 20,
    color: colors.text,
  },
  topBarLeading: {
    flexShrink: 0,
  },
  topBarText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topBarTitle: {
    ...typography.title,
    color: colors.text,
  },
  topBarSubtitle: {
    ...typography.caption,
    color: colors.textDim,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.eyebrow,
    color: colors.textDim,
  },
  sectionAction: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: "700",
  },
  segmented: {
    flexDirection: "row",
    padding: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.sidebarStrong,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: colors.active,
  },
  segmentPressed: {
    opacity: 0.82,
  },
  segmentText: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: colors.text,
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyEyebrow: {
    ...typography.eyebrow,
    color: colors.textDim,
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: 46,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
    textAlign: "center",
  },
  emptyHint: {
    ...typography.body,
    color: colors.textDim,
    textAlign: "center",
    lineHeight: 22,
  },
  inlineAction: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.brandMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  inlineActionPressed: {
    opacity: 0.8,
  },
  inlineActionText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "700",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBannerSuccess: {
    borderColor: "rgba(55, 205, 147, 0.28)",
    backgroundColor: "rgba(12, 39, 33, 0.84)",
  },
  statusBannerDanger: {
    borderColor: "rgba(239, 95, 118, 0.28)",
    backgroundColor: "rgba(42, 13, 22, 0.9)",
  },
  statusText: {
    ...typography.caption,
    color: colors.textSoft,
    flex: 1,
  },
  statusSuccess: {
    color: "#8ce9bf",
  },
  statusDanger: {
    color: "#ff9bb0",
  },
  statusDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  statusDismissPressed: {
    backgroundColor: colors.hover,
  },
  statusDismissText: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: "700",
  },
  tabBarWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: "transparent",
  },
  tabBarPanel: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.rail,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.floating,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  tabItemActive: {
    backgroundColor: colors.brandMuted,
  },
  tabItemPressed: {
    opacity: 0.8,
  },
  tabIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: "rgba(132, 155, 205, 0.16)",
  },
  tabIconActive: {
    backgroundColor: colors.brand,
    borderColor: colors.borderStrong,
  },
  tabIconText: {
    fontSize: 16,
  },
  tabLabel: {
    ...typography.label,
    color: colors.textDim,
  },
  tabLabelActive: {
    color: colors.text,
  },
});
