import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { createApiClient } from "./src/api";
import { resolveCoreApiUrl } from "./src/config";
import { parseDeepLink } from "./src/deeplinks";
import { registerForPushNotificationsAsync } from "./src/notifications";
import { clearTokens, loadPushToken, loadTokens, savePushToken, saveTokens } from "./src/storage";
import { colors } from "./src/theme";
import type { AuthTokens, Channel, ChannelMessage, CoreServer, DeepLinkTarget, Guild } from "./src/types";

type AuthMode = "login" | "register";

export default function App() {
  const coreApiUrl = useMemo(() => resolveCoreApiUrl(), []);
  const tokensRef = useRef<AuthTokens | null>(null);
  const pendingDeepLinkRef = useRef<DeepLinkTarget | null>(null);

  const [booting, setBooting] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [tokens, setTokensState] = useState<AuthTokens | null>(null);
  const [me, setMe] = useState<{ id: string; username: string } | null>(null);
  const [servers, setServers] = useState<CoreServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  const setPersistedTokens = useCallback(async (next: AuthTokens | null) => {
    tokensRef.current = next;
    setTokensState(next);
    if (next) await saveTokens(next);
    else await clearTokens();
  }, []);

  const api = useMemo(
    () =>
      createApiClient({
        coreApiUrl,
        getTokens: () => tokensRef.current,
        setTokens: setPersistedTokens,
        updateServerMembershipToken: (serverId, membershipToken) => {
          setServers((current) =>
            current.map((server) => (server.id === serverId ? { ...server, membershipToken } : server))
          );
        }
      }),
    [coreApiUrl, setPersistedTokens]
  );

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) || null,
    [servers, selectedServerId]
  );

  const refreshServers = useCallback(async () => {
    const [meData, serversData] = await Promise.all([api.getMe(), api.getServers()]);
    setMe({ id: meData.id, username: meData.username });
    const nextServers = serversData.servers || [];
    setServers(nextServers);
    const nextSelected =
      nextServers.find((server) => server.id === selectedServerId)?.id ||
      nextServers[0]?.id ||
      "";
    setSelectedServerId(nextSelected);
  }, [api, selectedServerId]);

  const refreshMessages = useCallback(async () => {
    if (!selectedServer || !selectedChannelId) return;
    const data = await api.listMessages(selectedServer, selectedChannelId);
    setMessages((data.messages || []).slice().reverse());
  }, [api, selectedChannelId, selectedServer]);

  const applyDeepLinkTarget = useCallback(
    async (target: DeepLinkTarget) => {
      if (target.kind === "login") {
        await setPersistedTokens(null);
        setMe(null);
        setServers([]);
        setGuilds([]);
        setChannels([]);
        setMessages([]);
        setStatus("Logged out. Please sign in.");
        return;
      }

      if (target.kind === "join") {
        if (!tokensRef.current) {
          pendingDeepLinkRef.current = target;
          setStatus("Sign in to accept invite.");
          return;
        }
        try {
          const joined = await api.joinInvite(target.code);
          await refreshServers();
          if (joined.serverId) setSelectedServerId(joined.serverId);
          setStatus("Invite accepted.");
          pendingDeepLinkRef.current = null;
        } catch {
          setStatus("Invite join failed.");
        }
        return;
      }

      pendingDeepLinkRef.current = target;
    },
    [api, refreshServers, setPersistedTokens]
  );

  const handleIncomingUrl = useCallback(
    async (url: string) => {
      const target = parseDeepLink(url);
      if (!target) return;
      await applyDeepLinkTarget(target);
    },
    [applyDeepLinkTarget]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await loadTokens();
      if (!alive) return;
      tokensRef.current = stored;
      setTokensState(stored);
      if (stored) {
        try {
          await refreshServers();
        } catch {
          await setPersistedTokens(null);
          setStatus("Session expired. Please sign in.");
        }
      }
      setBooting(false);

      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) await handleIncomingUrl(initialUrl);
    })();

    const linkSub = Linking.addEventListener("url", (event) => {
      void handleIncomingUrl(event.url);
    });

    const notifTapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      const next = String((data.deepLink as string) || (data.url as string) || "");
      if (next) void handleIncomingUrl(next);
    });

    const notifReceiveSub = Notifications.addNotificationReceivedListener(() => {
      void refreshMessages();
    });

    return () => {
      alive = false;
      linkSub.remove();
      notifTapSub.remove();
      notifReceiveSub.remove();
    };
  }, [handleIncomingUrl, refreshMessages, refreshServers, setPersistedTokens]);

  useEffect(() => {
    const pending = pendingDeepLinkRef.current;
    if (!pending) return;

    if (pending.kind === "server") {
      if (!servers.some((server) => server.id === pending.serverId)) return;
      setSelectedServerId(pending.serverId);
      pendingDeepLinkRef.current = null;
      return;
    }

    if (pending.kind === "channel") {
      if (!servers.some((server) => server.id === pending.serverId)) return;
      if (selectedServerId !== pending.serverId) {
        setSelectedServerId(pending.serverId);
        return;
      }
      if (selectedGuildId !== pending.guildId) {
        setSelectedGuildId(pending.guildId);
        return;
      }
      if (!channels.some((channel) => channel.id === pending.channelId)) return;
      setSelectedChannelId(pending.channelId);
      pendingDeepLinkRef.current = null;
    }
  }, [channels, selectedGuildId, selectedServerId, servers]);

  useEffect(() => {
    if (!tokens?.accessToken) return;
    let alive = true;
    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!alive || !token) return;
        const existing = await loadPushToken();
        if (token !== existing) {
          await api.registerPushToken(token);
          await savePushToken(token);
        }
      } catch {
        if (alive) setStatus((current) => current || "Push registration skipped.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, tokens?.accessToken]);

  useEffect(() => {
    if (!selectedServer) {
      setGuilds([]);
      setSelectedGuildId("");
      setChannels([]);
      setSelectedChannelId("");
      setMessages([]);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const nextGuilds = await api.listGuilds(selectedServer);
        if (!alive) return;
        setGuilds(nextGuilds || []);
        const preferred =
          nextGuilds.find((guild) => guild.id === selectedGuildId)?.id ||
          selectedServer.defaultGuildId ||
          nextGuilds[0]?.id ||
          "";
        setSelectedGuildId(preferred);
      } catch {
        if (alive) setStatus("Failed to load guilds.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, selectedGuildId, selectedServer]);

  useEffect(() => {
    if (!selectedServer || !selectedGuildId) {
      setChannels([]);
      setSelectedChannelId("");
      return;
    }
    let alive = true;
    (async () => {
      try {
        const state = await api.getGuildState(selectedServer, selectedGuildId);
        if (!alive) return;
        const textChannels = (state.channels || [])
          .filter((channel) => channel.type === "text")
          .sort((a, b) => a.position - b.position);
        setChannels(textChannels);
        const preferred =
          textChannels.find((channel) => channel.id === selectedChannelId)?.id ||
          textChannels[0]?.id ||
          "";
        setSelectedChannelId(preferred);
      } catch {
        if (alive) setStatus("Failed to load channels.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, selectedChannelId, selectedGuildId, selectedServer]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!selectedServer || !selectedChannelId) {
        setMessages([]);
        return;
      }
      try {
        await refreshMessages();
      } catch {
        if (alive) setStatus("Failed to load messages.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshMessages, selectedChannelId, selectedServer]);

  useEffect(() => {
    if (!selectedServer || !selectedChannelId) return;
    const timer = setInterval(() => {
      void refreshMessages();
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshMessages, selectedChannelId, selectedServer]);

  const onSubmitAuth = useCallback(async () => {
    if (!email.trim() || !password.trim()) return;
    setWorking(true);
    setStatus("");
    try {
      if (authMode === "register") {
        if (!username.trim()) {
          setStatus("Username is required.");
          return;
        }
        await api.register(email.trim(), username.trim(), password);
      }
      const login = await api.login(email.trim(), password);
      await setPersistedTokens({ accessToken: login.accessToken, refreshToken: login.refreshToken });
      setMe({ id: login.user.id, username: login.user.username });
      await refreshServers();
      setPassword("");
      setStatus("Logged in.");

      const pending = pendingDeepLinkRef.current;
      if (pending?.kind === "join") await applyDeepLinkTarget(pending);
    } catch {
      setStatus(authMode === "register" ? "Registration failed." : "Login failed.");
    } finally {
      setWorking(false);
    }
  }, [api, applyDeepLinkTarget, authMode, email, password, refreshServers, setPersistedTokens, username]);

  const onLogout = useCallback(async () => {
    await setPersistedTokens(null);
    setMe(null);
    setServers([]);
    setGuilds([]);
    setChannels([]);
    setMessages([]);
    setSelectedServerId("");
    setSelectedGuildId("");
    setSelectedChannelId("");
    setStatus("Logged out.");
  }, [setPersistedTokens]);

  const onJoinInvite = useCallback(async () => {
    const code = inviteCode.trim();
    if (!code || !tokensRef.current) return;
    try {
      setWorking(true);
      const joined = await api.joinInvite(code);
      await refreshServers();
      if (joined.serverId) setSelectedServerId(joined.serverId);
      setInviteCode("");
      setStatus("Invite accepted.");
    } catch {
      setStatus("Invite join failed.");
    } finally {
      setWorking(false);
    }
  }, [api, inviteCode, refreshServers]);

  const onSendMessage = useCallback(async () => {
    const content = composer.trim();
    if (!content || !selectedServer || !selectedChannelId) return;
    try {
      await api.sendMessage(selectedServer, selectedChannelId, content);
      setComposer("");
      await refreshMessages();
    } catch {
      setStatus("Failed to send message.");
    }
  }, [api, composer, refreshMessages, selectedChannelId, selectedServer]);

  if (booting) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.subtle}>Loading OpenCom...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
        <View style={styles.toolbar}>
          <Text style={styles.title}>OpenCom Android</Text>
          {tokens ? (
            <View style={styles.row}>
              <Pressable onPress={() => void refreshServers()} style={styles.actionButton}>
                <Text style={styles.actionText}>Refresh</Text>
              </Pressable>
              <Pressable onPress={onLogout} style={styles.actionButton}>
                <Text style={styles.actionText}>Logout</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {!tokens ? (
          <View style={styles.authCard}>
            <View style={styles.row}>
              <Pressable
                style={[styles.modeButton, authMode === "login" ? styles.modeButtonActive : null]}
                onPress={() => setAuthMode("login")}
              >
                <Text style={styles.modeButtonText}>Login</Text>
              </Pressable>
              <Pressable
                style={[styles.modeButton, authMode === "register" ? styles.modeButtonActive : null]}
                onPress={() => setAuthMode("register")}
              >
                <Text style={styles.modeButtonText}>Register</Text>
              </Pressable>
            </View>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={colors.mutedText}
            />
            {authMode === "register" ? (
              <TextInput
                value={username}
                onChangeText={setUsername}
                style={styles.input}
                autoCapitalize="none"
                placeholder="Username"
                placeholderTextColor={colors.mutedText}
              />
            ) : null}
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              autoCapitalize="none"
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.mutedText}
            />
            <Pressable onPress={onSubmitAuth} style={styles.primaryButton} disabled={working}>
              <Text style={styles.primaryButtonText}>
                {working ? "Working..." : authMode === "register" ? "Create Account" : "Sign In"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.nativeContent}>
            <Text style={styles.subtle}>Signed in as {me?.username || me?.id || "user"}</Text>

            <Text style={styles.sectionTitle}>Join Invite</Text>
            <View style={styles.row}>
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                style={[styles.input, styles.flex]}
                autoCapitalize="none"
                placeholder="Invite code"
                placeholderTextColor={colors.mutedText}
              />
              <Pressable onPress={onJoinInvite} style={styles.primaryButtonCompact} disabled={working}>
                <Text style={styles.primaryButtonText}>Join</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Servers</Text>
            <View style={styles.wrapRow}>
              {servers.map((server) => (
                <Pressable
                  key={server.id}
                  style={[styles.pill, selectedServerId === server.id ? styles.pillActive : null]}
                  onPress={() => setSelectedServerId(server.id)}
                >
                  <Text style={styles.pillText}>{server.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Guilds</Text>
            <View style={styles.wrapRow}>
              {guilds.map((guild) => (
                <Pressable
                  key={guild.id}
                  style={[styles.pill, selectedGuildId === guild.id ? styles.pillActive : null]}
                  onPress={() => setSelectedGuildId(guild.id)}
                >
                  <Text style={styles.pillText}>{guild.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Channels</Text>
            <View style={styles.wrapRow}>
              {channels.map((channel) => (
                <Pressable
                  key={channel.id}
                  style={[styles.pill, selectedChannelId === channel.id ? styles.pillActive : null]}
                  onPress={() => setSelectedChannelId(channel.id)}
                >
                  <Text style={styles.pillText}>#{channel.name}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Messages</Text>
            <View style={styles.messagesCard}>
              {messages.map((message) => (
                <View key={message.id} style={styles.messageRow}>
                  <Text style={styles.messageAuthor}>{message.username || message.author_id}</Text>
                  <Text style={styles.messageBody}>{message.content}</Text>
                </View>
              ))}
            </View>

            <TextInput
              value={composer}
              onChangeText={setComposer}
              style={styles.input}
              placeholder={selectedChannelId ? "Write a message..." : "Select a channel first"}
              placeholderTextColor={colors.mutedText}
            />
            <Pressable onPress={onSendMessage} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Send</Text>
            </Pressable>
          </ScrollView>
        )}

        {status ? <Text style={styles.status}>{status}</Text> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10
  },
  flex: {
    flex: 1
  },
  toolbar: {
    backgroundColor: colors.surface,
    borderBottomColor: "#23283a",
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  actionButton: {
    backgroundColor: "#23283a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  actionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  authCard: {
    margin: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 10,
    gap: 10
  },
  nativeContent: {
    padding: 16,
    gap: 10
  },
  modeButton: {
    backgroundColor: "#1b2133",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  modeButtonActive: {
    backgroundColor: "#25526a"
  },
  modeButtonText: {
    color: colors.text,
    fontWeight: "600"
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6
  },
  subtle: {
    color: colors.mutedText
  },
  input: {
    backgroundColor: "#0f1320",
    borderColor: "#2a3047",
    borderWidth: 1,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButtonCompact: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    width: 80,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButtonText: {
    color: "#06141a",
    fontWeight: "700"
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  pill: {
    backgroundColor: "#1b2133",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999
  },
  pillActive: {
    backgroundColor: "#25526a"
  },
  pillText: {
    color: colors.text,
    fontSize: 13
  },
  messagesCard: {
    backgroundColor: "#101625",
    borderColor: "#23283a",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8
  },
  messageRow: {
    gap: 2
  },
  messageAuthor: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 12
  },
  messageBody: {
    color: colors.text
  },
  status: {
    color: colors.mutedText,
    paddingHorizontal: 16,
    paddingBottom: 12
  }
});
