#!/usr/bin/env node
/* eslint-env node */
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const rootDir = resolve(process.cwd());
const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/deploy.mjs <version>");
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

const updateVersion = (path) => {
  const pkg = readJson(path);
  pkg.version = version;
  writeJson(path, pkg);
};

const pkgPath = resolve(rootDir, "package.json");

ensureCleanGit();
ensureTagAvailable(`v${version}`);

updateVersion(pkgPath);

console.log(`\n🚀 Ready to release version ${version}?`);
console.log(`📦 Package: @paulp-o/opencode-background-agent@${version}`);
console.log(`\n⚠️  This will:`);
console.log(`   - Update package version`);
console.log(`   - Run typecheck and tests`);
console.log(`   - Build the package`);
console.log(`   - Commit and tag the release`);
console.log(`   - Publish to npm`);
console.log(`   - Push to GitHub`);
console.log(`\nStarting release in 3 seconds... (Ctrl+C to cancel)`);

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

console.log(`\n📝 Release created! Now create release notes:`);
console.log(`   1. Write release notes in RELEASE_NOTES.md`);
console.log(
  `   2. Run: gh release create v${version} --title "Release v${version}" --notes-file RELEASE_NOTES.md`
);
console.log(`   3. Or edit release notes directly on GitHub`);

const releaseNotesPath = resolve(rootDir, "RELEASE_NOTES.md");
const defaultNotes = `# Release v${version}

## What's New
-

## Bug Fixes
-

## Improvements
-

## Breaking Changes
-

## Installation
\`\`\`bash
npm install @paulp-o/opencode-background-agent@${version}
\`\`\`
`;

try {
  writeFileSync(releaseNotesPath, defaultNotes, "utf8");
  console.log(`\n📄 Template release notes created at: RELEASE_NOTES.md`);
  console.log(`   Edit this file with your release notes, then run:`);
  console.log(
    `   gh release create v${version} --title "Release v${version}" --notes-file RELEASE_NOTES.md`
  );
} catch (error) {
  console.log(`\n⚠️  Could not create RELEASE_NOTES.md template: ${error.message}`);
}
