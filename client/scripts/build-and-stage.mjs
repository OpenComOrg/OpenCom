import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(clientDir, "..");
const frontendDir = path.resolve(repoRoot, "frontend");
const frontendDownloadsDir = path.resolve(frontendDir, "public", "downloads");
const distDir = path.resolve(clientDir, "dist");

const TARGETS = {
  win: {
    npmScript: "build:win",
    artifacts: [{ from: "OpenCom.exe", to: "OpenCom.exe" }]
  },
  linux: {
    npmScript: "build:linux",
    artifacts: [
      { from: "OpenCom.deb", to: "OpenCom.deb", optional: true },
      { from: "OpenCom.rpm", to: "OpenCom.rpm", optional: true },
      { from: "OpenCom.snap", to: "OpenCom.snap", optional: true },
      { from: "OpenCom.tar.gz", to: "OpenCom.tar.gz" }
    ]
  }
};

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

async function copyArtifacts(artifacts) {
  for (const artifact of artifacts) {
    const source = path.join(distDir, artifact.from);
    try {
      await fs.mkdir(frontendDownloadsDir, { recursive: true });

      const destinations = [
        path.join(frontendDir, artifact.to),
        path.join(frontendDownloadsDir, artifact.to),
      ];

      for (const destination of destinations) {
        await fs.copyFile(source, destination);
      }

      console.log(
        `Staged ${artifact.from} -> frontend/${artifact.to} and frontend/public/downloads/${artifact.to}`,
      );
    } catch (error) {
      if (artifact.optional && error?.code === "ENOENT") {
        console.warn(`Skipping optional artifact ${artifact.from} (not produced on this system).`);
        continue;
      }
      throw error;
    }
  }
}

async function buildAndStage(target) {
  const config = TARGETS[target];
  if (!config) {
    throw new Error(`Unknown target '${target}'. Use one of: ${Object.keys(TARGETS).join(", ")}`);
  }

  await run("npm", ["run", config.npmScript], clientDir);
  await copyArtifacts(config.artifacts);
}

const target = process.argv[2];

if (!target) {
  console.error("Usage: node client/scripts/build-and-stage.mjs <win|linux>");
  process.exit(1);
}

buildAndStage(target).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
