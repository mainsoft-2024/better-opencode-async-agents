#!/usr/bin/env bun
/**
 * Release script for opencode-background-agent
 *
 * Usage:
 *   bun run release           # Full release
 *   bun run release:dry       # Dry run (no publish/push)
 *
 * Prerequisites:
 *   - Clean git working directory
 *   - NPM_TOKEN environment variable set (for publishing)
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { $ } from "bun";

// Configuration
const ROOT_DIR = join(import.meta.dir, "..");
const PACKAGE_JSON_PATH = join(ROOT_DIR, "package.json");
const CHANGELOG_PATH = join(ROOT_DIR, "CHANGELOG.md");

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

// Colors for output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(message: string, color: keyof typeof colors = "reset"): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function step(name: string): void {
  log(`\n${colors.bold}▶ ${name}${colors.reset}`, "cyan");
}

function success(message: string): void {
  log(`  ✓ ${message}`, "green");
}

function warn(message: string): void {
  log(`  ⚠ ${message}`, "yellow");
}

function error(message: string): void {
  log(`  ✗ ${message}`, "red");
}

async function exec(
  command: string,
  options: { silent?: boolean; allowFailure?: boolean } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await $`sh -c ${command}`.quiet().nothrow();
  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();

  if (!options.silent && stdout) {
    console.log(stdout);
  }

  if (result.exitCode !== 0 && !options.allowFailure) {
    if (stderr) {
      error(stderr);
    }
    throw new Error(`Command failed: ${command}`);
  }

  return { stdout, stderr, exitCode: result.exitCode };
}

async function validateGitState(): Promise<void> {
  step("Validating git state");

  const { stdout: status } = await exec("git status --porcelain", {
    silent: true,
  });

  if (status) {
    error("Working directory is not clean. Please commit or stash changes.");
    console.log("\nUncommitted changes:");
    console.log(status);
    process.exit(1);
  }

  success("Working directory is clean");

  // Check we're on a branch that can be pushed
  const { stdout: branch } = await exec("git rev-parse --abbrev-ref HEAD", {
    silent: true,
  });
  success(`On branch: ${branch}`);
}

async function runTests(): Promise<void> {
  step("Running tests");
  await exec("bun test");
  success("All tests passed");
}

async function runLint(): Promise<void> {
  step("Running lint");
  const { exitCode } = await exec("bun run lint", { allowFailure: true });

  if (exitCode !== 0) {
    warn("Lint has warnings (continuing)");
  } else {
    success("Lint passed");
  }
}

async function runTypeCheck(): Promise<void> {
  step("Running type check");
  await exec("bun run typecheck");
  success("Type check passed");
}

async function runBuild(): Promise<void> {
  step("Building package");
  await exec("bun run build:all");
  success("Build completed");
}

type VersionBump = "patch" | "minor" | "major";

async function determineVersionBump(): Promise<VersionBump> {
  step("Determining version bump from commits");

  // Get commits since last tag
  const { stdout: lastTag, exitCode } = await exec("git describe --tags --abbrev=0 2>/dev/null", {
    silent: true,
    allowFailure: true,
  });

  const range = exitCode === 0 ? `${lastTag}..HEAD` : "HEAD";
  const { stdout: commits } = await exec(`git log ${range} --pretty=format:"%s"`, {
    silent: true,
  });

  if (!commits) {
    warn("No commits found, defaulting to patch");
    return "patch";
  }

  const commitLines = commits.split("\n");
  let bump: VersionBump = "patch";

  for (const commit of commitLines) {
    if (commit.includes("BREAKING CHANGE") || commit.includes("!:")) {
      bump = "major";
      break;
    }
    if (commit.startsWith("feat:") || commit.startsWith("feat(")) {
      bump = "minor";
    }
  }

  success(`Version bump: ${bump} (based on ${commitLines.length} commits)`);
  return bump;
}

function incrementVersion(version: string, bump: VersionBump): string {
  const [major, minor, patch] = version.split(".").map(Number);

  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function updateVersion(bump: VersionBump): Promise<string> {
  step("Updating version");

  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
  const oldVersion = packageJson.version;
  const newVersion = incrementVersion(oldVersion, bump);

  packageJson.version = newVersion;
  writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + "\n");

  success(`Version updated: ${oldVersion} → ${newVersion}`);
  return newVersion;
}

async function generateChangelog(version: string): Promise<void> {
  step("Generating changelog");

  await exec("bun run changelog");
  success(`Changelog updated for v${version}`);
}

async function createGitCommitAndTag(version: string): Promise<void> {
  step("Creating git commit and tag");

  if (isDryRun) {
    warn("Dry run: Skipping git commit and tag");
    return;
  }

  await exec("git add package.json CHANGELOG.md");
  await exec(`git commit -m "chore(release): v${version}"`);
  await exec(`git tag -a v${version} -m "Release v${version}"`);

  success(`Created commit and tag: v${version}`);
}

async function publishToNpm(): Promise<void> {
  step("Publishing to npm");

  if (isDryRun) {
    warn("Dry run: Running npm publish --dry-run");
    await exec("npm publish --access public --dry-run");
    return;
  }

  const { exitCode } = await exec("npm whoami", { silent: true, allowFailure: true });
  if (exitCode !== 0) {
    error("Not logged in to npm. Run 'npm login' first.");
    process.exit(1);
  }

  await exec("npm publish --access public");
  success("Published to npm");
}

async function pushToRemote(version: string): Promise<void> {
  step("Pushing to remote");

  if (isDryRun) {
    warn("Dry run: Skipping git push");
    return;
  }

  await exec("git push");
  await exec("git push --tags");

  success(`Pushed v${version} to remote`);
}

async function createGitHubRelease(version: string): Promise<void> {
  step("Creating GitHub release");

  if (isDryRun) {
    warn("Dry run: Skipping GitHub release");
    return;
  }

  const { exitCode: ghCheck } = await exec("which gh", { silent: true, allowFailure: true });
  if (ghCheck !== 0) {
    warn("gh CLI not found, skipping GitHub release");
    return;
  }

  await exec(`gh release create v${version} --title "Release v${version}" --generate-notes`);
  success(`Created GitHub release: v${version}`);
}

async function main(): Promise<void> {
  log("\n╔═══════════════════════════════════════════╗", "bold");
  log("║  opencode-background-agent Release Script  ║", "bold");
  log("╚═══════════════════════════════════════════╝", "bold");

  if (isDryRun) {
    log("\n🔍 DRY RUN MODE - No changes will be published\n", "yellow");
  }

  try {
    // Validation phase
    await validateGitState();
    await runTests();
    await runLint();
    await runTypeCheck();
    await runBuild();

    // Version phase
    const bump = await determineVersionBump();
    const version = await updateVersion(bump);
    await generateChangelog(version);

    // Release phase
    await createGitCommitAndTag(version);
    await publishToNpm();
    await pushToRemote(version);
    await createGitHubRelease(version);

    log("\n╔═══════════════════════════════════════════╗", "green");
    log(`║  ✓ Release v${version} complete!`.padEnd(44) + "║", "green");
    log("╚═══════════════════════════════════════════╝", "green");

    if (isDryRun) {
      log("\n📝 This was a dry run. To release for real, run:", "yellow");
      log("   bun run release\n", "yellow");
    }
  } catch (err) {
    log("\n╔═══════════════════════════════════════════╗", "red");
    log("║  ✗ Release failed!                        ║", "red");
    log("╚═══════════════════════════════════════════╝", "red");

    if (err instanceof Error) {
      error(err.message);
    }

    process.exit(1);
  }
}

main();
