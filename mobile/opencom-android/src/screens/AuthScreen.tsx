import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ScreenBackground,
  SegmentedControl,
  StatusBanner,
  SurfaceCard,
} from "../components/chrome";
import { colors, radii, spacing, typography, useTheme } from "../theme";

type AuthMode = "login" | "register";

type AuthScreenProps = {
  onLogin: (
    email: string,
    username: string,
    password: string,
    mode: AuthMode,
  ) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  status: string;
};

export function AuthScreen({
  onLogin,
  onForgotPassword,
  status,
}: AuthScreenProps) {
  const { theme } = useTheme();
  const palette = theme.colors;
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);

  const title = useMemo(
    () => (mode === "login" ? "Welcome back" : "Create your account"),
    [mode],
  );

  const handleSubmit = useCallback(async () => {
    if (!email.trim() || !password.trim()) return;
    if (mode === "register" && !username.trim()) return;

    setWorking(true);
    try {
      await onLogin(email.trim(), username.trim(), password, mode);
    } finally {
      setWorking(false);
    }
  }, [email, mode, onLogin, password, username]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim() || working) return;
    setWorking(true);
    try {
      await onForgotPassword(email.trim());
    } finally {
      setWorking(false);
    }
  }, [email, onForgotPassword, working]);

  return (
    <ScreenBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.brandChip}>
              <Text style={styles.brandChipText}>OPENCOM</Text>
            </View>
            <Text style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroSubtitle}>
              OpenCom keeps your teams, communities, and updates in one place.
            </Text>
          </View>

          <SurfaceCard style={styles.card}>
            <SegmentedControl
              value={mode}
              onChange={(value) => setMode(value as AuthMode)}
              options={[
                { value: "login", label: "Log in" },
                { value: "register", label: "Create account" },
              ]}
            />

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={palette.textDim}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!working}
              />
            </View>

            {mode === "register" ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  style={styles.input}
                  placeholder="Choose a username"
                  placeholderTextColor={palette.textDim}
                  autoCapitalize="none"
                  editable={!working}
                />
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                placeholder={
                  mode === "login" ? "Enter your password" : "Create a password"
                }
                placeholderTextColor={palette.textDim}
                secureTextEntry
                autoCapitalize="none"
                editable={!working}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                working && styles.primaryButtonDisabled,
                pressed && !working && styles.primaryButtonPressed,
              ]}
              onPress={handleSubmit}
              disabled={working}
            >
              {working ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === "login" ? "Log in" : "Create account"}
                </Text>
              )}
            </Pressable>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {mode === "login"
                  ? "Need an account?"
                  : "Already have an account?"}
              </Text>
              <Pressable onPress={() => setMode(mode === "login" ? "register" : "login")}>
                <Text style={styles.metaAction}>
                  {mode === "login" ? "Create one" : "Log in"}
                </Text>
              </Pressable>
            </View>

            {mode === "login" ? (
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
                onPress={handleForgotPassword}
                disabled={working}
              >
                <Text style={styles.secondaryButtonText}>Send password reset link</Text>
              </Pressable>
            ) : null}
          </SurfaceCard>

          <SurfaceCard style={styles.infoCard}>
            <Text style={styles.infoEyebrow}>DESKTOP DNA</Text>
            <Text style={styles.infoTitle}>Built to match the OpenCom desktop feel</Text>
            <View style={styles.infoList}>
              <Text style={styles.infoItem}>Layered server navigation</Text>
              <Text style={styles.infoItem}>Fast access to messages and friends</Text>
              <Text style={styles.infoItem}>Profile, presence, and invite tools in one flow</Text>
            </View>
          </SurfaceCard>

          {status ? (
            <StatusBanner
              text={status}
              tone={
                status.toLowerCase().includes("invalid") ||
                status.toLowerCase().includes("failed") ||
                status.toLowerCase().includes("error")
                  ? "danger"
                  : "neutral"
              }
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    gap: spacing.lg,
  },
  hero: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  brandChip: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.brandMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  brandChipText: {
    ...typography.eyebrow,
    color: colors.textSoft,
  },
  heroTitle: {
    ...typography.hero,
    color: colors.text,
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.textDim,
    lineHeight: 22,
  },
  card: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.eyebrow,
    color: colors.textDim,
  },
  input: {
    backgroundColor: colors.input,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    ...typography.caption,
    color: colors.textDim,
  },
  metaAction: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonPressed: {
    backgroundColor: colors.hover,
  },
  secondaryButtonText: {
    ...typography.caption,
    color: colors.textSoft,
    fontWeight: "700",
  },
  infoCard: {
    gap: spacing.sm,
  },
  infoEyebrow: {
    ...typography.eyebrow,
    color: colors.textDim,
  },
  infoTitle: {
    ...typography.heading,
    color: colors.text,
  },
  infoList: {
    gap: spacing.xs,
  },
  infoItem: {
    ...typography.body,
    color: colors.textSoft,
  },
});
