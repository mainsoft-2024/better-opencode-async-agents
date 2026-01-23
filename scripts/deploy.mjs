#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(process.cwd());
const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/deploy.mjs <version>");
  console.error("Example: node scripts/deploy.mjs 1.0.0");
  process.exit(1);
}

const run = (command, options = {}) => {
  console.log(`[deploy] ${command}`);
  execSync(command, { stdio: "inherit", ...options });
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, data) => {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const ensureCleanGit = () => {
  const status = execSync("git status --porcelain", {
    encoding: "utf8",
  }).trim();
  if (status.length > 0) {
    console.error("Git working tree is not clean. Commit or stash first.");
    process.exit(1);
  }
};

const ensureTagAvailable = (tag) => {
  const localTags = execSync("git tag", { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (localTags.includes(tag)) {
    console.error(`Git tag ${tag} already exists locally.`);
    process.exit(1);
  }

  try {
    const remoteTags = execSync(`git ls-remote --tags origin ${tag}`, {
      encoding: "utf8",
    }).trim();

    if (remoteTags.length > 0) {
      console.error(`Git tag ${tag} already exists on origin.`);
      process.exit(1);
    }
  } catch {
    // Best-effort only; remote might be unreachable.
  }
};

const setupNpmAuth = () => {
  const token = process.env.NPM_TOKEN;
  if (!token) {
    console.error("NPM_TOKEN environment variable is required.");
    console.error("Set it in your .zshrc or .bashrc:");
    console.error('  export NPM_TOKEN="npm_xxxx..."');
    process.exit(1);
  }

  const npmrcPath = resolve(rootDir, ".npmrc");
  writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${token}\n`, "utf8");
  console.log("✓ .npmrc configured with NPM_TOKEN (2FA bypass)");
};

const updateVersion = (path) => {
  const pkg = readJson(path);
  pkg.version = version;
  writeJson(path, pkg);
};

const pkgPath = resolve(rootDir, "package.json");

ensureCleanGit();
ensureTagAvailable(`v${version}`);
setupNpmAuth();

updateVersion(pkgPath);

console.log(`\n🚀 Ready to release version ${version}?`);
console.log(`📦 Package: @paulp-o/opencode-superagents@${version}`);
console.log("\n⚠️  This will:");
console.log("   - Update package version");
console.log("   - Run typecheck and tests");
console.log("   - Build the package");
console.log("   - Commit and tag the release");
console.log("   - Publish to npm");
console.log("   - Push to GitHub");
console.log("   - Create GitHub release");
console.log("\nStarting release in 3 seconds... (Ctrl+C to cancel)");

await new Promise((resolve) => {
  setTimeout(resolve, 3000);
});

console.log("✅ Starting release process...\n");

run("bun install");
run("bun run typecheck");
run("bun test");
run("bun run build:all");

run("git add package.json bun.lock");
run(`git commit -m "chore(release): v${version}"`);
run(`git tag v${version}`);

run("npm publish --access public");

run("git push origin HEAD --tags");

run(`gh release create v${version} --title "Release v${version}" --generate-notes`);

console.log(`\n✅ Release v${version} complete!`);
console.log("📦 npm: https://www.npmjs.com/package/@paulp-o/opencode-superagents");
console.log(
  `🐙 GitHub: https://github.com/paulp-o/opencode-superagents/releases/tag/v${version}`
);
