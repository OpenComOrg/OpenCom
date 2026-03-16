import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "..");

function run(cmd, args, cwd = clientDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === "win32",
      stdio: "inherit"
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

function parseCliArgs(argv) {
  const options = {
    skipBuild: false,
    wantsHelp: false,
    forwardedArgs: []
  };

  for (const arg of argv) {
    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.wantsHelp = true;
    }

    options.forwardedArgs.push(arg);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/build-aur.mjs [options] [stage options]

Build the Linux artifacts and stage the Arch/AUR package directory.

Options:
  --skip-build                 Reuse existing Linux build artifacts and only stage AUR files
  -h, --help                   Show this help text and the stage-aur options
`);
}

async function main() {
  const { forwardedArgs, skipBuild, wantsHelp } = parseCliArgs(process.argv.slice(2));

  if (wantsHelp) {
    printHelp();
    await run(process.execPath, [path.join(__dirname, "stage-aur.mjs"), ...forwardedArgs], clientDir);
    return;
  }

  if (!skipBuild) {
    await run("npm", ["run", "build:linux"], clientDir);
  }

  await run(process.execPath, [path.join(__dirname, "stage-aur.mjs"), ...forwardedArgs], clientDir);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
