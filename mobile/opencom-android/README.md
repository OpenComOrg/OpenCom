# OpenCom Android App

Android-native OpenCom client built with Expo + React Native.

## Includes

- Native auth (`login` + `register`)
- Native server/guild/channel/message flow
- Invite join in-app
- Deep-link handling
- Push token registration to core API

## Prerequisites

- Node.js 20+
- Android Studio (SDK + emulator)
- `adb` available in shell

## Install

```bash
cd mobile/opencom-android
npm install
```

## Run

```bash
npm run android
```

Or run Expo dev server:

```bash
npm start
```

## Configure Core API URL

Default: `https://api.opencom.online`

Override:

```bash
EXPO_PUBLIC_OPENCOM_CORE_API_URL=https://api.your-host.tld npm run android
```

## Build APK (Install + Build + Optional Relay)

One command (install deps, prebuild, build release APK):

```bash
npm run apk
```

The script also auto-runs `sdkmanager --licenses` and installs required SDK packages (`platform-tools`, `platforms;android-35`, `build-tools;35.0.0`, `ndk;27.1.12297006`).

Build and immediately serve over local HTTP relay:

```bash
npm run apk:relay
```

Output files are written to:

`mobile/opencom-android/dist/`

### Arch Linux SDK note

If SDK is not auto-detected, set:

```bash
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
```

Then rerun:

```bash
npm run apk
```

### Java/JDK requirement

Android builds need a JDK (`JAVA_HOME`).

On Arch:

```bash
sudo pacman -S jdk17-openjdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export PATH="$JAVA_HOME/bin:$PATH"
```

## Supported Deep Links

- `opencom://login`
- `opencom://join/<inviteCode>`
- `opencom://server/<serverId>`
- `opencom://channel/<serverId>/<guildId>/<channelId>`
- `https://opencom.online/join/<inviteCode>`
