import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { writeLinuxReleaseManifest } from "./release-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "..");

const isWindows = process.platform === "win32";
const electronBuilderCmd = isWindows
  ? path.join(clientDir, "node_modules", ".bin", "electron-builder.cmd")
  : path.join(clientDir, "node_modules", ".bin", "electron-builder");

function run(cmd, args, cwd = clientDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: isWindows,
      stdio: "inherit"
    });

    child.on("error", (error) => reject(error));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const requireDeb = process.env.OPENCOM_REQUIRE_DEB === "1";
  const requireRpm = process.env.OPENCOM_REQUIRE_RPM === "1";
  const requireSnap = process.env.OPENCOM_REQUIRE_SNAP === "1";
  const tarballPath = path.join(clientDir, "dist", "OpenCom.tar.gz");
  const builderCacheDir = process.env.ELECTRON_BUILDER_CACHE || path.join(clientDir, ".cache", "electron-builder");

  process.env.ELECTRON_BUILDER_CACHE = builderCacheDir;
  await fs.mkdir(builderCacheDir, { recursive: true });

  await run(electronBuilderCmd, ["--linux", "tar.gz"]);
  if (!(await fileExists(tarballPath))) {
    throw new Error("Linux tar.gz artifact was not produced.");
  }

  try {
    await run(electronBuilderCmd, ["--linux", "deb"]);
  } catch (error) {
    if (requireDeb) throw error;
    console.warn(`Deb packaging failed (optional): ${error?.message || error}`);
  }

  try {
    await run(electronBuilderCmd, ["--linux", "rpm"]);
  } catch (error) {
    if (requireRpm) throw error;
    console.warn(`RPM packaging failed (optional): ${error?.message || error}`);
  }

  try {
    await run(electronBuilderCmd, ["--linux", "snap"]);
  } catch (error) {
    if (requireSnap) throw error;
    console.warn(`Snap packaging failed (optional): ${error?.message || error}`);
  }

  const manifest = await writeLinuxReleaseManifest();
  console.log(
    `Wrote Linux release metadata for ${manifest.version} to dist/linux-release-manifest.json`,
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
