import { useCallback, useEffect, useRef, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, Linking, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { useCoreGateway, httpToCoreGatewayWs } from "./src/hooks/useGateway";

import { AuthScreen } from "./src/screens/AuthScreen";
import { ServersScreen } from "./src/screens/ServersScreen";
import { ChannelScreen } from "./src/screens/ChannelScreen";
import { DmsScreen } from "./src/screens/DmsScreen";
import { DmChatScreen } from "./src/screens/DmChatScreen";
import { FriendsScreen } from "./src/screens/FriendsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { PinnedMessagesScreen } from "./src/screens/PinnedMessagesScreen";
import { CreateInviteScreen } from "./src/screens/CreateInviteScreen";
import { MembersScreen } from "./src/screens/MembersScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

import { parseDeepLink } from "./src/deeplinks";
import {
  initNotificationsSafe,
  registerForPushNotificationsAsync,
} from "./src/notifications";
import { loadPushToken, loadTokens, savePushToken } from "./src/storage";

import type {
  Channel,
  CoreServer,
  DeepLinkTarget,
  DmThreadApi,
  Friend,
  Guild,
} from "./src/types";
import { colors } from "./src/theme";

// ─── Navigator instances ──────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();
const MainStack = createNativeStackNavigator();

// ─── Tab screen wrappers ──────────────────────────────────────────────────────

function TabServers({ navigation }: { navigation: any }) {
  const onSelectChannel = useCallback(
    (server: CoreServer, guild: Guild, channel: Channel) => {
      navigation.navigate("Channel", { server, guild, channel });
    },
    [navigation],
  );

  const onViewInvites = useCallback(
    (server: CoreServer) => {
      navigation.navigate("CreateInvite", { server });
    },
    [navigation],
  );

  const onViewMembers = useCallback(
    (server: CoreServer, guild: Guild) => {
      navigation.navigate("Members", { server, guild });
    },
    [navigation],
  );

  return (
    <ServersScreen
      onSelectChannel={onSelectChannel}
      onViewInvites={onViewInvites}
      onViewMembers={onViewMembers}
    />
  );
}

function TabDms({ navigation }: { navigation: any }) {
  const onSelectDm = useCallback(
    (thread: DmThreadApi) => {
      navigation.navigate("DmChat", { thread });
    },
    [navigation],
  );

  return <DmsScreen onSelectDm={onSelectDm} />;
}

function TabFriends({ navigation }: { navigation: any }) {
  const { api } = useAuth();

  const onOpenDm = useCallback(
    async (friend: Friend) => {
      try {
        const { threadId } = await api.openDm(friend.id);
        navigation.navigate("DmChat", {
          thread: {
            id: threadId,
            participantId: friend.id,
            name: friend.username,
            pfp_url: friend.pfp_url ?? null,
            lastMessageAt: null,
            lastMessageContent: null,
          } satisfies DmThreadApi,
        });
      } catch {
        // FriendsScreen will show a status error if needed
      }
    },
    [api, navigation],
  );

  return <FriendsScreen onOpenDm={onOpenDm} />;
}

function TabProfile({ navigation }: { navigation: any }) {
  const { setTokens } = useAuth();

  const onLogout = useCallback(async () => {
    await setTokens(null);
  }, [setTokens]);

  const onOpenSettings = useCallback(() => {
    navigation.navigate("Settings");
  }, [navigation]);

  return <ProfileScreen onLogout={onLogout} onOpenSettings={onOpenSettings} />;
}

// ─── Tab navigator ────────────────────────────────────────────────────────────

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.sidebar },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.rail,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="Servers"
        component={TabServers}
        options={{
          title: "Servers",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="DMs"
        component={TabDms}
        options={{
          title: "Messages",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>💬</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={TabFriends}
        options={{
          title: "Friends",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>👥</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={TabProfile}
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>👤</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Stack screen wrappers ────────────────────────────────────────────────────

function ChannelScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { server, guild, channel } = route.params as {
    server: CoreServer;
    guild: Guild;
    channel: Channel;
  };

  const onViewPins = useCallback(() => {
    navigation.navigate("PinnedMessages", {
      mode: "channel",
      server,
      channel,
    });
  }, [navigation, server, channel]);

  const onViewMembers = useCallback(() => {
    navigation.navigate("Members", { server, guild });
  }, [navigation, server, guild]);

  return (
    <ChannelScreen
      server={server}
      guild={guild}
      channel={channel}
      onBack={() => navigation.goBack()}
      onViewPins={onViewPins}
      onViewMembers={onViewMembers}
    />
  );
}

function DmChatScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { thread } = route.params as { thread: DmThreadApi };

  const onViewPins = useCallback(() => {
    navigation.navigate("PinnedMessages", { mode: "dm", thread });
  }, [navigation, thread]);

  return (
    <DmChatScreen
      thread={thread}
      onBack={() => navigation.goBack()}
      onViewPins={onViewPins}
    />
  );
}

function PinnedMessagesScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { mode, server, channel, thread } = route.params;

  if (mode === "channel") {
    return (
      <PinnedMessagesScreen
        mode="channel"
        server={server}
        channel={channel}
        onBack={() => navigation.goBack()}
      />
    );
  }
  return (
    <PinnedMessagesScreen
      mode="dm"
      thread={thread}
      onBack={() => navigation.goBack()}
    />
  );
}

function CreateInviteScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { server } = route.params as { server: CoreServer };
  return (
    <CreateInviteScreen server={server} onBack={() => navigation.goBack()} />
  );
}

function MembersScreenWrapper({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { server, guild } = route.params as {
    server: CoreServer;
    guild: Guild;
  };
  const { api, me } = useAuth();

  const onOpenDm = useCallback(
    async (userId: string, username: string) => {
      try {
        const { threadId } = await api.openDm(userId);
        navigation.navigate("DmChat", {
          thread: {
            id: threadId,
            participantId: userId,
            name: username,
            pfp_url: null,
            lastMessageAt: null,
            lastMessageContent: null,
          } satisfies DmThreadApi,
        });
      } catch {
        Alert.alert("Error", "Could not open DM with this user.");
      }
    },
    [api, navigation],
  );

  return (
    <MembersScreen
      server={server}
      guild={guild}
      myId={me?.id ?? ""}
      onBack={() => navigation.goBack()}
      onOpenDm={onOpenDm}
    />
  );
}

function SettingsScreenWrapper({ navigation }: { navigation: any }) {
  const { setTokens } = useAuth();

  const onLogout = useCallback(async () => {
    await setTokens(null);
  }, [setTokens]);

  return <SettingsScreen onLogout={onLogout} />;
}

// ─── Main stack navigator ─────────────────────────────────────────────────────

function MainNavigator() {
  return (
    <MainStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <MainStack.Screen name="Tabs" component={MainTabs} />
      <MainStack.Screen
        name="Channel"
        component={ChannelScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="DmChat"
        component={DmChatScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="PinnedMessages"
        component={PinnedMessagesScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="CreateInvite"
        component={CreateInviteScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="Members"
        component={MembersScreenWrapper}
        options={{ presentation: "card" }}
      />
      <MainStack.Screen
        name="Settings"
        component={SettingsScreenWrapper}
        options={{ presentation: "card" }}
      />
    </MainStack.Navigator>
  );
}

// ─── Gateway-wired app content ────────────────────────────────────────────────

function AppContent() {
  const {
    tokens,
    setTokens,
    me,
    setMe,
    refreshServers,
    refreshMyProfile,
    api,
    coreApiUrl,
    updatePresence,
    upsertDmMessage,
    removeDmMessage,
    setDmThreads,
  } = useAuth();

  const [booting, setBooting] = useState(true);
  const [authStatus, setAuthStatus] = useState("");
  const pendingDeepLinkRef = useRef<DeepLinkTarget | null>(null);

  const getApiErrorCode = useCallback((error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error || "");
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === "string") return parsed.error;
    } catch {}
    return raw || "UNKNOWN_ERROR";
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const gatewayWsUrl = httpToCoreGatewayWs(coreApiUrl);

  // ── Core gateway ─────────────────────────────────────────────────────────────
  // Handles real-time DMs, presence, and call events globally.
  useCoreGateway({
    wsUrl: gatewayWsUrl,
    accessToken: tokens?.accessToken ?? null,
    enabled: !!tokens?.accessToken,
    onEvent: useCallback(
      (event) => {
        switch (event.type) {
          case "PRESENCE_UPDATE":
            updatePresence(event.userId, event.status, event.customStatus);
            break;

          case "DM_NEW_MESSAGE":
            upsertDmMessage(event.threadId, event.message);
            // If thread unknown, refresh thread list
            setDmThreads((prev) => {
              if (!prev.some((t) => t.id === event.threadId)) {
                api
                  .getDms()
                  .then((data) => setDmThreads(data.dms ?? []))
                  .catch(() => {});
              }
              return prev;
            });
            break;

          case "DM_MESSAGE_DELETED":
            removeDmMessage(event.threadId, event.messageId);
            break;

          case "CALL_INCOMING":
            Alert.alert(
              "📞 Incoming Call",
              `${event.callerName} is calling you`,
              [
                { text: "Decline", style: "cancel" },
                {
                  text: "Answer (Web/Desktop)",
                  onPress: () => {
                    // Voice calls require the web/desktop app
                    Alert.alert(
                      "Voice Calls",
                      "Accept voice calls from the OpenCom web or desktop app.",
                    );
                  },
                },
              ],
            );
            break;

          case "FRIEND_REQUEST":
            Alert.alert(
              "👋 Friend Request",
              `${event.username} sent you a friend request`,
              [{ text: "OK" }],
            );
            break;

          case "FRIEND_ACCEPTED":
            Alert.alert(
              "✅ New Friend",
              `${event.username} accepted your friend request!`,
              [{ text: "OK" }],
            );
            break;

          default:
            break;
        }
      },
      [updatePresence, upsertDmMessage, removeDmMessage, setDmThreads, api],
    ),
  });

  // ── Auth helpers ──────────────────────────────────────────────────────────────

  const handleAuth = useCallback(
    async (
      email: string,
      username: string,
      password: string,
      mode: "login" | "register",
    ) => {
      try {
        setAuthStatus(mode === "register" ? "Creating account..." : "Signing in...");
        if (mode === "register") {
          await api.register(email, username, password);
        }
        const login = await api.login(email, password);
        await setTokens({
          accessToken: login.accessToken,
          refreshToken: login.refreshToken,
        });
        setMe({ id: login.user.id, username: login.user.username });
        setAuthStatus("");
        await refreshServers();
        // Load full profile after sign in
        refreshMyProfile().catch(() => {});
      } catch (error: unknown) {
        const code = getApiErrorCode(error);
        if (code === "EMAIL_NOT_VERIFIED") {
          setAuthStatus("Check your email and verify your account before logging in.");
          return;
        }
        if (code === "SMTP_NOT_CONFIGURED") {
          setAuthStatus("SMTP is not configured on the API server.");
          return;
        }
        if (code === "SMTP_AUTH_FAILED") {
          setAuthStatus("SMTP authentication failed.");
          return;
        }
        if (code === "SMTP_CONNECTION_FAILED") {
          setAuthStatus("Could not connect to the SMTP server.");
          return;
        }
        if (code === "INVALID_CREDENTIALS") {
          setAuthStatus("Invalid email or password.");
          return;
        }
        setAuthStatus(code);
      }
    },
    [api, getApiErrorCode, setTokens, setMe, refreshServers, refreshMyProfile],
  );

  const handleForgotPassword = useCallback(
    async (email: string) => {
      const normalizedEmail = String(email || "").trim();
      if (!normalizedEmail) {
        setAuthStatus("Enter your email first.");
        return;
      }
      try {
        setAuthStatus("Sending reset link...");
        await api.forgotPassword(normalizedEmail);
        setAuthStatus("If the account exists, a password reset link has been sent.");
      } catch (error: unknown) {
        const code = getApiErrorCode(error);
        if (code === "SMTP_NOT_CONFIGURED") {
          setAuthStatus("SMTP is not configured on the API server.");
          return;
        }
        if (code === "SMTP_AUTH_FAILED") {
          setAuthStatus("SMTP authentication failed.");
          return;
        }
        if (code === "SMTP_CONNECTION_FAILED") {
          setAuthStatus("Could not connect to the SMTP server.");
          return;
        }
        setAuthStatus(code);
      }
    },
    [api, getApiErrorCode],
  );

  // ── Deep link handling ────────────────────────────────────────────────────────

  const applyDeepLinkTarget = useCallback(
    async (target: DeepLinkTarget) => {
      if (target.kind === "login") {
        await setTokens(null);
        setMe(null);
        setAuthStatus("You have been signed out.");
        return;
      }
      if (target.kind === "join") {
        if (!tokens) {
          pendingDeepLinkRef.current = target;
          setAuthStatus("Sign in to accept the invite.");
          return;
        }
        try {
          await api.joinInvite(target.code);
          await refreshServers();
          setAuthStatus("Invite accepted!");
          pendingDeepLinkRef.current = null;
        } catch {
          setAuthStatus("Failed to join via invite link.");
        }
        return;
      }
      // Other deep link kinds can be stored and handled post-login
      pendingDeepLinkRef.current = target;
    },
    [api, refreshServers, setTokens, setMe, tokens],
  );

  const handleIncomingUrl = useCallback(
    async (url: string) => {
      const target = parseDeepLink(url);
      if (!target) return;
      await applyDeepLinkTarget(target);
    },
    [applyDeepLinkTarget],
  );

  // ── Boot sequence ─────────────────────────────────────────────────────────────

  useEffect(() => {
    initNotificationsSafe();
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      // Restore session from storage
      const stored = await loadTokens();
      if (!alive) return;

      if (stored) {
        try {
          await refreshServers();
          // Load full profile in the background
          refreshMyProfile().catch(() => {});
        } catch {
          await setTokens(null);
          setAuthStatus("Session expired. Please sign in again.");
        }
      }

      setBooting(false);

      // Handle cold-start deep link
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) await handleIncomingUrl(initialUrl);
    })();

    // Warm deep links
    const linkSub = Linking.addEventListener(
      "url",
      (e) => void handleIncomingUrl(e.url),
    );

    // Notification tap → deep link
    const notifTapSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data ?? {};
        const url = String(
          (data.deepLink as string) ?? (data.url as string) ?? "",
        );
        if (url) void handleIncomingUrl(url);
      },
    );

    // Notification received while foregrounded → refresh servers
    const notifReceiveSub = Notifications.addNotificationReceivedListener(
      () => {
        void refreshServers();
      },
    );

    return () => {
      alive = false;
      linkSub.remove();
      notifTapSub.remove();
      notifReceiveSub.remove();
    };
  }, [handleIncomingUrl, refreshServers, refreshMyProfile, setTokens]);

  // ── Pending deep link after sign in ───────────────────────────────────────────

  useEffect(() => {
    const pending = pendingDeepLinkRef.current;
    if (tokens?.accessToken && pending) {
      pendingDeepLinkRef.current = null;
      void applyDeepLinkTarget(pending);
    }
  }, [tokens?.accessToken, applyDeepLinkTarget]);

  // ── Push token registration ───────────────────────────────────────────────────

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
        // Non-fatal; push notifications are optional
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, tokens?.accessToken]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (booting) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
        }}
      >
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={{ color: colors.textDim, fontSize: 14 }}>
          Loading OpenCom…
        </Text>
      </View>
    );
  }

  if (!tokens) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <AuthScreen onLogin={handleAuth} onForgotPassword={handleForgotPassword} status={authStatus} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={
        {
          dark: true,
          colors: {
            primary: colors.brand,
            background: colors.background,
            card: colors.sidebar,
            text: colors.text,
            border: colors.border,
            notification: colors.brand,
          },
          fonts: {
            regular: { fontFamily: "System", fontWeight: "400" },
            medium: { fontFamily: "System", fontWeight: "500" },
            bold: { fontFamily: "System", fontWeight: "700" },
            heavy: { fontFamily: "System", fontWeight: "900" },
          },
        } as any
      }
    >
      <StatusBar style="light" />
      <MainNavigator />
    </NavigationContainer>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
