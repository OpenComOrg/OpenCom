import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const electronBuilderCmd = isWindows
  ? path.join(clientDir, "node_modules", ".bin", "electron-builder.cmd")
  : path.join(clientDir, "node_modules", ".bin", "electron-builder");
const winBuildArgs = ["--win", "nsis"];
const defaultMode = isWindows ? "local" : "container";

function run(cmd, args, { cwd = clientDir, env = process.env, stdio = "inherit" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio,
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function commandExists(cmd) {
  try {
    await run(cmd, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function resolveContainerEngine() {
  const override = String(process.env.OPENCOM_CONTAINER_ENGINE || "").trim();
  if (override) {
    return (await commandExists(override)) ? override : "";
  }

  for (const candidate of ["docker", "podman"]) {
    if (await commandExists(candidate)) return candidate;
  }
  return "";
}

async function runLocalBuild() {
  await run(electronBuilderCmd, winBuildArgs);
}

function resolveContainerImage() {
  const image = String(process.env.OPENCOM_WIN_CONTAINER_IMAGE || "").trim();
  return image || "electronuserland/builder:wine";
}

async function runContainerBuild(engine) {
  const image = resolveContainerImage();
  const electronCacheDir = process.env.ELECTRON_CACHE || path.join(clientDir, ".cache", "electron");
  const builderCacheDir = process.env.ELECTRON_BUILDER_CACHE || path.join(clientDir, ".cache", "electron-builder");

  await fs.mkdir(electronCacheDir, { recursive: true });
  await fs.mkdir(builderCacheDir, { recursive: true });

  const args = [
    "run",
    "--rm",
    ...(process.stdout.isTTY ? ["-t"] : []),
    "-w",
    "/project",
    "-v",
    `${clientDir}:/project`,
    "-v",
    `${electronCacheDir}:/home/builder/.cache/electron`,
    "-v",
    `${builderCacheDir}:/home/builder/.cache/electron-builder`,
    "-e",
    "ELECTRON_CACHE=/home/builder/.cache/electron",
    "-e",
    "ELECTRON_BUILDER_CACHE=/home/builder/.cache/electron-builder",
    image,
    "/bin/bash",
    "-lc",
    "./node_modules/.bin/electron-builder --win nsis"
  ];

  await run(engine, args);
}

async function main() {
  const mode = String(process.env.OPENCOM_WIN_BUILD_MODE || defaultMode).trim().toLowerCase();
  if (!["local", "container", "auto"].includes(mode)) {
    throw new Error(`Invalid OPENCOM_WIN_BUILD_MODE='${mode}'. Use: local, container, auto.`);
  }

  if (mode === "local" || isWindows) {
    await runLocalBuild();
    return;
  }

  const engine = await resolveContainerEngine();
  if (!engine) {
    if (mode === "auto") {
      console.warn("No Docker/Podman detected. Falling back to local Windows build (requires Wine).");
      await runLocalBuild();
      return;
    }
    throw new Error(
      "No Docker/Podman detected. Install Docker/Podman, or set OPENCOM_WIN_BUILD_MODE=local and install Wine."
    );
  }

  try {
    await runContainerBuild(engine);
  } catch (error) {
    if (mode !== "auto") throw error;
    console.warn(`Container Windows build failed (${engine}). Falling back to local Wine build.`);
    await runLocalBuild();
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
