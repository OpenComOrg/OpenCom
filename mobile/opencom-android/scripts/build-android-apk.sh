#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
DIST_DIR="$ROOT_DIR/dist"
VARIANT="release"
RUN_INSTALL=1
RUN_PREBUILD=1
START_RELAY=0
RELAY_PORT="${RELAY_PORT:-8080}"
RUN_SDK_SETUP=1

usage() {
  cat <<'EOF'
Usage: ./scripts/build-android-apk.sh [options]

Options:
  --debug                 Build debug APK instead of release
  --skip-install          Skip npm install
  --skip-prebuild         Skip expo prebuild
  --relay                 Start local relay HTTP server after build
  --port <port>           Relay port (default: 8080)
  --skip-sdk-setup        Skip sdkmanager licenses/components setup
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)
      VARIANT="debug"
      shift
      ;;
    --skip-install)
      RUN_INSTALL=0
      shift
      ;;
    --skip-prebuild)
      RUN_PREBUILD=0
      shift
      ;;
    --relay)
      START_RELAY=1
      shift
      ;;
    --port)
      RELAY_PORT="${2:-}"
      if [[ -z "$RELAY_PORT" ]]; then
        echo "Missing value for --port" >&2
        exit 1
      fi
      shift 2
      ;;
    --skip-sdk-setup)
      RUN_SDK_SETUP=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

pick_android_sdk() {
  local candidates=()
  [[ -n "${ANDROID_HOME:-}" ]] && candidates+=("$ANDROID_HOME")
  [[ -n "${ANDROID_SDK_ROOT:-}" ]] && candidates+=("$ANDROID_SDK_ROOT")
  candidates+=(
    "$HOME/Android/Sdk"
    "$HOME/Android/sdk"
    "/opt/android-sdk"
    "/usr/lib/android-sdk"
    "/usr/local/android-sdk"
  )

  local path
  for path in "${candidates[@]}"; do
    [[ -z "$path" ]] && continue
    if [[ -d "$path/platform-tools" || -d "$path/cmdline-tools" || -d "$path/build-tools" ]]; then
      echo "$path"
      return 0
    fi
  done

  return 1
}

ensure_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

ensure_cmd node
ensure_cmd npm

if ! SDK_PATH="$(pick_android_sdk)"; then
  cat >&2 <<'EOF'
Android SDK not found.
Set ANDROID_HOME or ANDROID_SDK_ROOT to your SDK path.
On Arch Linux this is often /opt/android-sdk.
EOF
  exit 1
fi

export ANDROID_HOME="$SDK_PATH"
export ANDROID_SDK_ROOT="$SDK_PATH"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/tools/bin:$PATH"

if [[ -z "${JAVA_HOME:-}" ]]; then
  if command -v archlinux-java >/dev/null 2>&1; then
    if JAVA_CANDIDATE="$(archlinux-java get 2>/dev/null)"; then
      if [[ -n "$JAVA_CANDIDATE" && -d "/usr/lib/jvm/$JAVA_CANDIDATE" ]]; then
        export JAVA_HOME="/usr/lib/jvm/$JAVA_CANDIDATE"
      fi
    fi
  fi

  if [[ -z "${JAVA_HOME:-}" ]] && command -v java >/dev/null 2>&1; then
    JAVA_BIN="$(readlink -f "$(command -v java)" || true)"
    if [[ -n "$JAVA_BIN" ]]; then
      export JAVA_HOME="$(cd "$(dirname "$JAVA_BIN")/.." && pwd)"
    fi
  fi
fi

if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
  cat >&2 <<'EOF'
JAVA_HOME is not set or invalid.
Install a JDK (17 recommended) and set JAVA_HOME.
Examples (Arch):
  sudo pacman -S jdk17-openjdk
  export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
EOF
  exit 1
fi

export PATH="$JAVA_HOME/bin:$PATH"

if ! command -v adb >/dev/null 2>&1; then
  cat >&2 <<EOF
adb not found on PATH.
Resolved SDK: $ANDROID_HOME
Install Android platform-tools (sdkmanager "platform-tools") or install system adb package.
Expected SDK location:
  $ANDROID_HOME/platform-tools/adb
EOF
  exit 1
fi

if [[ "$RUN_SDK_SETUP" -eq 1 ]]; then
  if command -v sdkmanager >/dev/null 2>&1; then
    echo "==> Accepting Android SDK licenses"
    yes | sdkmanager --licenses >/dev/null || true

    echo "==> Installing required Android SDK components"
    sdkmanager --install \
      "platform-tools" \
      "platforms;android-35" \
      "build-tools;35.0.0" \
      "ndk;27.1.12297006"
  else
    cat >&2 <<EOF
sdkmanager not found on PATH.
Install Android command-line tools under:
  $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager
Or run with --skip-sdk-setup if components are already installed.
EOF
    exit 1
  fi
fi

cd "$ROOT_DIR"

if [[ "$RUN_INSTALL" -eq 1 ]]; then
  echo "==> Installing npm dependencies"
  npm install
fi

if [[ "$RUN_PREBUILD" -eq 1 ]]; then
  echo "==> Running Expo prebuild"
  CI=1 npx expo prebuild --platform android
fi

if [[ ! -x "$ANDROID_DIR/gradlew" ]]; then
  chmod +x "$ANDROID_DIR/gradlew"
fi

echo "==> Building $VARIANT APK"
pushd "$ANDROID_DIR" >/dev/null
if [[ "$VARIANT" == "debug" ]]; then
  ./gradlew --no-daemon assembleDebug
  APK_SOURCE="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
else
  ./gradlew --no-daemon assembleRelease
  APK_SOURCE="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
fi
popd >/dev/null

if [[ ! -f "$APK_SOURCE" ]]; then
  echo "APK not found at expected path: $APK_SOURCE" >&2
  exit 1
fi

mkdir -p "$DIST_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
APK_NAME="OpenCom-android-${VARIANT}-${STAMP}.apk"
APK_TARGET="$DIST_DIR/$APK_NAME"
cp "$APK_SOURCE" "$APK_TARGET"

if command -v sha256sum >/dev/null 2>&1; then
  SUM_LINE="$(sha256sum "$APK_TARGET")"
  echo "$SUM_LINE" > "$APK_TARGET.sha256"
elif command -v shasum >/dev/null 2>&1; then
  SUM_LINE="$(shasum -a 256 "$APK_TARGET")"
  echo "$SUM_LINE" > "$APK_TARGET.sha256"
else
  SUM_LINE="sha256 tool unavailable"
fi

echo
echo "APK ready:"
echo "  $APK_TARGET"
echo "SHA256:"
echo "  $SUM_LINE"
echo
echo "Direct install via USB (optional):"
echo "  adb install -r \"$APK_TARGET\""

if [[ "$START_RELAY" -eq 1 ]]; then
  ensure_cmd python3
  LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -z "$LOCAL_IP" ]] && LOCAL_IP="127.0.0.1"
  echo
  echo "Relay URL (same network):"
  echo "  http://$LOCAL_IP:$RELAY_PORT/$APK_NAME"
  echo
  echo "Starting relay server from $DIST_DIR ..."
  exec python3 -m http.server "$RELAY_PORT" --directory "$DIST_DIR"
fi
