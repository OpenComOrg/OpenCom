import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIN_VERSION = [10, 2, 1];

function parse(version) {
  const [major = "0", minor = "0", patch = "0"] = version.split(".");
  return [Number(major), Number(minor), Number(patch)];
}

function isAtLeast(version, min) {
  const current = parse(version);

  for (let i = 0; i < 3; i += 1) {
    if (current[i] > min[i]) return true;
    if (current[i] < min[i]) return false;
  }

  return true;
}

const __filename = fileURLToPath(import.meta.url);
const clientDir = path.resolve(path.dirname(__filename), "..");

const lockfile = JSON.parse(fs.readFileSync(path.join(clientDir, "package-lock.json"), "utf8"));
const vendorPackage = JSON.parse(fs.readFileSync(path.join(clientDir, "vendor", "minimatch", "package.json"), "utf8"));

const failures = [];

if (!isAtLeast(vendorPackage.version || "0.0.0", MIN_VERSION)) {
  failures.push(`vendor/minimatch version is ${vendorPackage.version || "unknown"}`);
}

for (const [pkgPath, entry] of Object.entries(lockfile.packages || {})) {
  if (!pkgPath.endsWith("/node_modules/minimatch") && pkgPath !== "node_modules/minimatch") {
    continue;
  }

  if (entry.link === true) {
    const resolved = String(entry.resolved || "");
    if (!resolved.endsWith("/vendor/minimatch") && !resolved.includes("vendor/minimatch")) {
      failures.push(`${pkgPath} links to unexpected target: ${resolved || "(missing resolved)"}`);
    }
    continue;
  }

  const version = entry.version || "0.0.0";
  if (!isAtLeast(version, MIN_VERSION)) {
    failures.push(`${pkgPath} has version ${version}`);
  }
}

if (failures.length > 0) {
  console.error("Minimatch dependency check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("All minimatch dependencies are locked to the local safe override (>= 10.2.1)");
