{ pkgs ? import <nixpkgs> {
    config = {
      allowUnfree = true;
      android_sdk.accept_license = true;
    };
  }
}:

let
  androidPackages = pkgs.androidenv.composeAndroidPackages {
    platformVersions = [
      "35"
      "36"
    ];
    buildToolsVersions = [
      "35.0.0"
      "36.0.0"
    ];
    includeCmake = true;
    cmakeVersions = [ "3.22.1" ];
    includeNDK = true;
    ndkVersions = [ "27.1.12297006" ];
    abiVersions = [
      "x86"
      "x86_64"
      "armeabi-v7a"
      "arm64-v8a"
    ];
  };

  androidSdk = androidPackages.androidsdk;
  androidSdkRoot = "${androidSdk}/libexec/android-sdk";
  androidNdkRoot = "${androidSdkRoot}/ndk/27.1.12297006";
in
pkgs.mkShell {
  name = "opencom-android-shell";

  packages = with pkgs; [
    androidSdk
    jdk17
    nodejs_20
    watchman
    python3
    pkg-config
    cmake
    ninja
    git
  ];

  ANDROID_HOME = androidSdkRoot;
  ANDROID_SDK_ROOT = androidSdkRoot;
  ANDROID_NDK_ROOT = androidNdkRoot;
  ANDROID_NDK_HOME = androidNdkRoot;
  JAVA_HOME = "${pkgs.jdk17}";

  # Use the SDK-provided binary so Gradle does not fetch an unpatched aapt2 on NixOS.
  GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdkRoot}/build-tools/36.0.0/aapt2";

  shellHook = ''
    echo "OpenCom Android build shell"
    echo "  Node: $(node --version)"
    echo "  Java: $(java -version 2>&1 | head -n 1)"
    echo "  Android SDK: $ANDROID_SDK_ROOT"
  '';
}
