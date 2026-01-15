// Dynamic Expo configuration
// GL-TRACE-001: Computes build info at build time to ensure fingerprint is NEVER "unknown"
const { execSync } = require("child_process");
const crypto = require("crypto");

// Generate a unique build ID as ultimate fallback
const BUILD_ID = `B${Date.now().toString(36).toUpperCase()}`;

/**
 * Safely execute a git command
 * @returns {string|null} Command output or null on failure
 */
function gitExec(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

/**
 * Get UTC formatted timestamp (consistent, no timezone confusion)
 */
function getUtcTimestamp() {
  const now = new Date();
  // Use UTC ISO format for consistency across all environments
  return now.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

/**
 * Compute build info from git - NEVER returns "unknown" for critical fields
 */
function computeBuildInfo() {
  const buildTime = getUtcTimestamp();

  // Try to get git SHA
  let gitSha = gitExec("git rev-parse --short HEAD");
  if (!gitSha) {
    // Use build ID if git unavailable
    gitSha = BUILD_ID;
    console.warn("[app.config.js] WARNING: Git not available, using build ID as SHA");
  }

  // Try to get branch
  let branch = gitExec("git branch --show-current");
  if (!branch) {
    // Check if we're in detached HEAD (e.g., during CI build from tag)
    const headRef = gitExec("git describe --tags --exact-match HEAD 2>/dev/null") ||
                    gitExec("git rev-parse --abbrev-ref HEAD");
    branch = headRef || "build";
  }

  // Check dirty status
  let isDirty = false;
  let modifiedCount = 0;
  let untrackedCount = 0;
  let fingerprint = gitSha;

  const statusOutput = gitExec("git status --porcelain");
  if (statusOutput) {
    isDirty = true;
    const lines = statusOutput.split("\n").filter(Boolean);
    modifiedCount = lines.filter((l) => !l.startsWith("??")).length;
    untrackedCount = lines.filter((l) => l.startsWith("??")).length;

    // Compute dirty fingerprint hash
    const hash = crypto.createHash("sha256").update(statusOutput).digest("hex").slice(0, 8);
    fingerprint = `${gitSha}-dirty-${hash}`;
  }

  return {
    gitSha,
    branch,
    fingerprint,
    isDirty,
    modifiedCount,
    untrackedCount,
    buildTime,
    buildId: BUILD_ID, // Always include build ID for uniqueness
  };
}

module.exports = ({ config }) => {
  // Check for env var overrides first (from redmi.ps1 dev workflow)
  const envFingerprint = process.env.EXPO_PUBLIC_WORKTREE_FINGERPRINT;
  const useEnvVars = envFingerprint && envFingerprint !== "unknown";

  let buildInfo;
  if (useEnvVars) {
    // Use env vars from redmi.ps1
    buildInfo = {
      gitSha: process.env.EXPO_PUBLIC_GIT_SHA || BUILD_ID,
      branch: process.env.EXPO_PUBLIC_GIT_BRANCH || "env",
      fingerprint: envFingerprint,
      isDirty: process.env.EXPO_PUBLIC_WORKTREE_DIRTY === "1",
      modifiedCount: parseInt(process.env.EXPO_PUBLIC_MODIFIED_COUNT || "0", 10),
      untrackedCount: parseInt(process.env.EXPO_PUBLIC_UNTRACKED_COUNT || "0", 10),
      buildTime: process.env.EXPO_PUBLIC_BUILD_TIME || getUtcTimestamp(),
      buildId: BUILD_ID,
    };
    console.log("[app.config.js] Using env vars from redmi.ps1");
  } else {
    // Compute from git
    buildInfo = computeBuildInfo();
    console.log("[app.config.js] Computed build info from git");
  }

  // CRITICAL: Validate that we have real values
  if (!buildInfo.fingerprint || buildInfo.fingerprint === "unknown") {
    console.error("[app.config.js] CRITICAL: fingerprint is unknown, using fallback");
    buildInfo.fingerprint = buildInfo.buildId;
  }
  if (!buildInfo.gitSha || buildInfo.gitSha === "unknown") {
    console.error("[app.config.js] CRITICAL: gitSha is unknown, using fallback");
    buildInfo.gitSha = buildInfo.buildId;
  }

  // Log build info for visibility
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    BUILD INFO (app.config.js)                 ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Fingerprint: ${buildInfo.fingerprint.padEnd(46)}║`);
  console.log(`║  SHA:         ${buildInfo.gitSha.padEnd(46)}║`);
  console.log(`║  Branch:      ${buildInfo.branch.padEnd(46)}║`);
  console.log(`║  Dirty:       ${String(buildInfo.isDirty).padEnd(46)}║`);
  console.log(`║  Build Time:  ${buildInfo.buildTime.padEnd(46)}║`);
  console.log(`║  Build ID:    ${buildInfo.buildId.padEnd(46)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  return {
    ...config,
    extra: {
      ...config.extra,
      // GL-TRACE-001: Embed build info in app config for runtime access
      // These values are NEVER "unknown" - they have real fallbacks
      BUILD_GIT_SHA: buildInfo.gitSha,
      BUILD_FINGERPRINT: buildInfo.fingerprint,
      BUILD_BRANCH: buildInfo.branch,
      BUILD_IS_DIRTY: buildInfo.isDirty,
      BUILD_MODIFIED_COUNT: buildInfo.modifiedCount,
      BUILD_UNTRACKED_COUNT: buildInfo.untrackedCount,
      BUILD_TIME: buildInfo.buildTime,
      BUILD_ID: buildInfo.buildId,
    },
  };
};
