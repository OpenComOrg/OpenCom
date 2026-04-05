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

const lockfile = JSON.parse(
  fs.readFileSync(path.join(clientDir, "package-lock.json"), "utf8"),
);

const vendorPkgPath = path.join(
  clientDir,
  "vendor",
  "minimatch",
  "package.json",
);

if (!fs.existsSync(vendorPkgPath)) {
  console.error("Minimatch dependency check failed:");
  console.error("- vendor/minimatch/package.json is missing");
  process.exit(1);
}

const vendorPackage = JSON.parse(fs.readFileSync(vendorPkgPath, "utf8"));

const failures = [];
const vendoredNodeModulesDir = path.join(
  clientDir,
  "vendor",
  "minimatch",
  "node_modules",
);

const requiredVendoredDeps = ["brace-expansion", "balanced-match"];

// ✅ strict but clear
if (!vendorPackage.version) {
  failures.push("vendor/minimatch is missing a version field");
} else if (!isAtLeast(vendorPackage.version, MIN_VERSION)) {
  failures.push(`vendor/minimatch version is ${vendorPackage.version}`);
}

// ✅ check vendored deps exist
for (const dep of requiredVendoredDeps) {
  const depPackage = path.join(vendoredNodeModulesDir, dep, "package.json");
  if (!fs.existsSync(depPackage)) {
    failures.push(
      `missing vendored dependency: vendor/minimatch/node_modules/${dep}`,
    );
  }
}

// ✅ ensure lockfile respects override
for (const [pkgPath, entry] of Object.entries(lockfile.packages || {})) {
  if (
    !pkgPath.endsWith("/node_modules/minimatch") &&
    pkgPath !== "node_modules/minimatch"
  ) {
    continue;
  }

  if (entry.link === true) {
    const resolved = String(entry.resolved || "");
    if (!resolved.includes("vendor/minimatch")) {
      failures.push(
        `${pkgPath} links to unexpected target: ${resolved || "(missing resolved)"}`,
      );
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

console.log(
  "All minimatch dependencies are locked to the local safe override (>= 10.2.1)",
);
