#!/usr/bin/env node

/* Script to scan all repositories and check GitHub Actions versions
 *
 * This script:
 * 1. Scans all repos in the workspace
 * 2. Finds all GitHub workflow files (.github/workflows/*.yml, *.yaml)
 * 3. Extracts used actions and their versions
 * 4. Checks if actions are up to date using cached latest versions
 *    (refresh cache from GitHub API only when run with "--fetch")
 * 5. Outputs results either per repo (default) or per action (when using "--group-by action")
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRepos } from './getRepos.mjs';
import { getVersionsCache, fetchLatestGitHubActionVersion } from './getLatestGitHubActionVersion.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse a workflow file and extract all actions using regex
 * This approach doesn't require YAML parsing libraries
 * @param {string} content - YAML content of the workflow file
 * @returns {Array<{action: string, version: string, sha?: string}>}
 */
const extractActions = (content) => {
  const actions = [];
  const seen = new Set();

  // Regex to match action references in YAML
  // Matches: uses: action/name@version # comment
  // Handles both inline and multi-line formats
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Match lines containing "uses:" (can be indented)
    if (trimmed.includes('uses:')) {
      // Extract the full line with original indentation for context
      let usesLine = line;

      // Extract uses value - handle both inline and next-line formats
      let usesValue = '';
      const usesMatch = usesLine.match(/uses:\s*(.+?)(?:\s*#|$)/);
      if (usesMatch) {
        usesValue = usesMatch[1].trim();
      } else {
        // Check if uses: is on its own line, value might be on next line
        if (trimmed === 'uses:' || trimmed.match(/^\s*uses:\s*$/)) {
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (nextLine && !nextLine.startsWith('-') && !nextLine.match(/^\w+:/)) {
              usesValue = nextLine;
              usesLine = line + '\n' + lines[i + 1];
              i++; // Skip next line
            }
          }
        }
      }

      if (!usesValue) continue;

      // Parse action@ref format
      // Format: owner/repo@ref or owner/repo@ref # comment
      const actionMatch = usesValue.match(/^([^\s@]+)@([^\s#]+)/);
      if (!actionMatch) continue;

      const [, action, ref] = actionMatch;

      // Extract version comment from the line(s)
      let version = ref;
      let sha = null;

      // Check for comment on the same line or next line
      const fullLineText = usesLine;
      const commentMatch = fullLineText.match(/#\s*(v?[\d.]+(?:-[a-z0-9]+)?|SHA:\s*[a-f0-9]+)/i);
      const commentVersion = commentMatch ? commentMatch[1].trim() : null;

      // Use comment version if available
      if (commentVersion) {
        version = commentVersion;
      }

      // Check if ref is a SHA (40 char hex or 7+ char short SHA)
      if (/^[a-f0-9]{40}$/i.test(ref)) {
        sha = ref;
        // If no version comment found, format SHA nicely
        if (!commentVersion) {
          version = `SHA:${ref.substring(0, 7)}`;
        }
      } else if (/^[a-f0-9]{7,39}$/i.test(ref) && !ref.match(/^v?\d/)) {
        // Short SHA (7-39 chars, not a version number)
        sha = ref;
        if (!commentVersion) {
          version = `SHA:${ref}`;
        }
      }

      // Create unique key to avoid duplicates
      const key = `${action}@${version}`;
      if (!seen.has(key)) {
        seen.add(key);
        actions.push({
          action,
          version,
          sha,
          ref,
        });
      }
    }
  }

  return actions;
};

/**
 * Compare versions to check if up to date
 * @param {string} currentVersion - Current version being used
 * @param {string} latestVersion - Latest available version
 * @returns {boolean|null} - true if up to date, false if outdated, null if unknown
 */
const isUpToDate = (currentVersion, latestVersion) => {
  if (!latestVersion) {
    return null; // Unknown
  }

  // If current version starts with 'SHA:', it's a commit SHA, can't compare
  if (currentVersion.startsWith('SHA:')) {
    return null;
  }

  // Remove 'v' prefix for comparison
  const normalize = (v) => v.replace(/^v/, '').trim();
  const current = normalize(currentVersion);
  const latest = normalize(latestVersion);

  // If versions match exactly
  if (current === latest) {
    return true;
  }

  // Try to parse as semantic versions for better comparison
  const parseVersion = (v) => {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/);
    if (match) {
      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        prerelease: match[4] || null,
      };
    }
    return null;
  };

  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);

  if (currentParts && latestParts) {
    // Compare major.minor.patch
    if (currentParts.major < latestParts.major) return false;
    if (currentParts.major > latestParts.major) return true; // Using newer major (unlikely but possible)
    if (currentParts.minor < latestParts.minor) return false;
    if (currentParts.minor > latestParts.minor) return true;
    if (currentParts.patch < latestParts.patch) return false;
    if (currentParts.patch > latestParts.patch) return true;

    // Same version numbers, check prerelease
    if (currentParts.prerelease && !latestParts.prerelease) return false;
    if (!currentParts.prerelease && latestParts.prerelease) return true;
    if (currentParts.prerelease && latestParts.prerelease) {
      return currentParts.prerelease === latestParts.prerelease;
    }

    return true; // Exact match
  }

  // Fallback to string comparison
  return current === latest;
};

/**
 * Log summary statistics for unique actions across all repos
 * @param {Array<{actions: Array<{action: string, version: string}>}>} results
 * @param {Map<string, string>} latestVersions
 */
const logStats = (results, latestVersions) => {
  const uniqueActionKeys = new Set();
  const uniqueActionStatus = new Map(); // key -> upToDate (true/false/null)

  for (const result of results) {
    for (const action of result.actions) {
      const key = `${action.action}@${action.version}`;
      if (!uniqueActionKeys.has(key)) {
        uniqueActionKeys.add(key);
        const latestVersion = latestVersions.get(action.action) ?? null;
        const upToDate = isUpToDate(action.version, latestVersion);
        uniqueActionStatus.set(key, upToDate);
      }
    }
  }

  let upToDateCount = 0;
  let outdatedCount = 0;
  let unknownCount = 0;
  for (const upToDate of uniqueActionStatus.values()) {
    if (upToDate === true) {
      upToDateCount++;
    } else if (upToDate === false) {
      outdatedCount++;
    } else {
      unknownCount++;
    }
  }

  console.log();
  console.log(`Total repositories scanned: ${results.filter((r) => r.actions.length > 0).length}`);
  console.log(`Total unique actions: ${uniqueActionKeys.size}`);
  console.log(`Up to date: ${upToDateCount}`);
  console.log(`Outdated: ${outdatedCount}`);
  console.log(`Unknown: ${unknownCount}`);
};

/**
 * Find all workflow files in a directory.
 *
 * @param {string} repoPath - Path to repository
 * @returns {Promise<Array<string>>}
 */
const findWorkflowFiles = async (repoPath) => {
  const workflowsPath = join(repoPath, '.github', 'workflows');
  const workflowFiles = [];

  try {
    const files = await readdir(workflowsPath);
    for (const file of files) {
      if (file.endsWith('.yml') || file.endsWith('.yaml')) {
        workflowFiles.push(join(workflowsPath, file));
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    return [];
  }

  return workflowFiles;
};

/**
 * Scan a single repository.
 *
 * @param {string} repoPath - Path to repository
 * @param {string} repoName - Name of repository
 * @returns {Promise<Object>}
 */
const scanRepository = async (repoPath, repoName) => {
  const workflowFiles = await findWorkflowFiles(repoPath);

  if (workflowFiles.length === 0) {
    return {
      repo: repoName,
      workflows: [],
      actions: [],
    };
  }

  const allActions = [];
  const workflows = [];

  for (const workflowFile of workflowFiles) {
    try {
      const content = await readFile(workflowFile, 'utf-8');
      const actions = extractActions(content);
      const workflowName = workflowFile.split('/').pop();

      workflows.push({
        file: workflowName,
        actions: actions.length,
      });

      allActions.push(
        ...actions.map((a) => ({
          ...a,
          workflow: workflowName,
        })),
      );
    } catch (error) {
      console.error(`Error reading ${workflowFile}:`, error.message);
    }
  }

  // Deduplicate actions (same action+version combination)
  const uniqueActions = new Map();
  for (const action of allActions) {
    const key = `${action.action}@${action.version}`;
    if (!uniqueActions.has(key)) {
      uniqueActions.set(key, action);
    }
  }

  return {
    repo: repoName,
    workflows: workflows,
    actions: Array.from(uniqueActions.values()),
  };
};

/**
 * Collect all unique action names from scan results and fetch their latest versions from GitHub API.
 *
 * @param {Array<{actions: Array<{action: string}>}>} results - Scan results from all repositories
 * @returns {Promise<Map<string, string|null>>} Map of action name -> latest version (or null)
 */
const fetchLatestVersionsForActions = async (results) => {
  const allUniqueActions = new Set();
  for (const result of results) {
    for (const action of result.actions) {
      allUniqueActions.add(action.action);
    }
  }

  const latestVersions = new Map();
  for (const actionName of allUniqueActions) {
    process.stdout.write(`Fetching ${actionName}... `);
    const latestVersion = await fetchLatestGitHubActionVersion(actionName);
    latestVersions.set(actionName, latestVersion);
    console.log(latestVersion != null ? '✓' : '✗');
  }
  return latestVersions;
};

/**
 * Get status indicator (emoji or checkbox) based on up-to-date status.
 *
 * @param {boolean|null} upToDate - true if up to date, false if outdated, null if unknown
 * @param {boolean} useTodo - whether to use markdown checkbox format
 * @returns {string} - Status indicator
 */
const getStatusIndicator = (upToDate, useTodo) => {
  if (useTodo) {
    return upToDate === true ? '- [x]' : '- [ ]';
  } else {
    if (upToDate === true) {
      return '✅';
    } else if (upToDate === false) {
      return '❌';
    } else {
      return '❓';
    }
  }
};

/**
 * @param {string} currentVersion - Current version being used
 * @param {string|null} latestVersion - Latest available version
 * @returns {string} - Formatted version string
 */
const formatVersion = (currentVersion, latestVersion) => {
  if (!latestVersion) {
    return currentVersion;
  }

  // Normalize versions for comparison (remove 'v' prefix)
  const normalize = (v) => v.replace(/^v/, '').trim();
  const current = normalize(currentVersion);
  const latest = normalize(latestVersion);

  if (current === latest) {
    return currentVersion;
  }

  return `${currentVersion} → ${latestVersion}`;
};

/**
 * Pad a string to a specific width for column alignment.
 *
 * @param {string} str - String to pad
 * @param {number} width - Target width
 * @param {boolean} right - Whether to pad on the right (default: left)
 * @returns {string} - Padded string
 */
const padColumn = (str, width, right = false) => {
  const strWidth = str.length;
  if (strWidth >= width) return str;
  const padding = ' '.repeat(width - strWidth);
  return right ? str + padding : padding + str;
};

const main = async () => {
  const workspaceRoot = process.cwd();
  const args = process.argv.slice(2);
  const shouldFetch = args.includes('--fetch');
  const useTodo = args.includes('--todo');

  // Grouping: "repo" (default) or "action"
  let groupBy = 'repo';
  const groupByIndex = args.indexOf('--group-by');
  if (groupByIndex !== -1 && args[groupByIndex + 1]) {
    const value = args[groupByIndex + 1];
    if (value === 'repo' || value === 'action') {
      groupBy = value;
    } else {
      console.warn(`Unknown --group-by value "${value}", falling back to "repo".`);
    }
  }

  const repos = getRepos().map((repoName) => ({
    name: repoName,
    path: join(workspaceRoot, repoName),
  }));
  console.log(`Found ${repos.length} repositories`);

  // Scan all repositories
  const results = [];
  for (const repo of repos) {
    process.stdout.write(`Scanning ${repo.name}... `);
    const result = await scanRepository(repo.path, repo.name);
    results.push(result);
    console.log(`✓ (${result.workflows.length} workflow(s), ${result.actions.length} unique action(s))`);
  }

  // Determine latest versions
  let latestVersions;
  if (shouldFetch) {
    console.log('Fetching latest versions from GitHub API...');
    latestVersions = await fetchLatestVersionsForActions(results);
  } else {
    latestVersions = await getVersionsCache();
    console.log('Using cached latest versions from file.');
    console.log('Run with "--fetch" to refresh from GitHub API.');
  }

  // Output results
  if (groupBy === 'repo') {
    for (const result of results) {
      if (result.actions.length === 0) {
        continue;
      }

      console.log(
        useTodo
          ? `\n${result.repo} (${result.workflows.map((w) => w.file).join(', ')})`
          : `\n\x1b[1m${result.repo}\x1b[0m \x1b[2m(${result.workflows.map((w) => w.file).join(', ')})\x1b[0m`,
      );

      let maxActionWidth = 0;
      let maxVersionWidth = 0;

      for (const action of result.actions) {
        const latestVersion = latestVersions.get(action.action) ?? null;
        const formattedVersion = formatVersion(action.version, latestVersion);

        maxActionWidth = Math.max(maxActionWidth, action.action.length);
        maxVersionWidth = Math.max(maxVersionWidth, formattedVersion.length);
      }

      maxActionWidth = Math.max(maxActionWidth, 20);
      maxVersionWidth = Math.max(maxVersionWidth, 10);

      for (const action of result.actions) {
        const latestVersion = latestVersions.get(action.action) ?? null;
        const upToDate = isUpToDate(action.version, latestVersion);

        const status = getStatusIndicator(upToDate, useTodo);
        const actionName = action.action;
        const version = formatVersion(action.version, latestVersion);

        console.log(
          `  ${padColumn(status, 2, true)} ${padColumn(actionName, maxActionWidth, true)} ${padColumn(version, maxVersionWidth, true)}`,
        );
      }
    }
  } else {
    // Group by action name across all repositories
    const actionsByName = new Map();

    for (const result of results) {
      for (const action of result.actions) {
        const key = action.action;
        if (!actionsByName.has(key)) {
          actionsByName.set(key, {
            action: key,
            usages: [],
          });
        }
        actionsByName.get(key).usages.push({
          repo: result.repo,
          workflow: action.workflow,
          version: action.version,
          sha: action.sha,
        });
      }
    }

    console.log(`Grouping: by action (${actionsByName.size} unique actions)\n`);

    for (const [actionName, entry] of actionsByName.entries()) {
      const latestVersion = latestVersions.get(actionName) ?? null;

      console.log(`\n${actionName} (latest: ${latestVersion})`);

      let maxRepoWidth = 0;
      let maxVersionWidth = 0;

      for (const usage of entry.usages) {
        const location = `${usage.repo}/${usage.workflow}`;
        const formattedVersion = formatVersion(usage.version, latestVersion);
        maxRepoWidth = Math.max(maxRepoWidth, location.length);
        maxVersionWidth = Math.max(maxVersionWidth, formattedVersion.length);
      }

      maxRepoWidth = Math.max(maxRepoWidth, 30);
      maxVersionWidth = Math.max(maxVersionWidth, 15);

      for (const usage of entry.usages) {
        const upToDate = isUpToDate(usage.version, latestVersion);

        const status = getStatusIndicator(upToDate, useTodo);
        const location = `${usage.repo}/${usage.workflow}`;
        const version = formatVersion(usage.version, latestVersion);

        console.log(
          `  ${padColumn(status, 2, true)} ${padColumn(location, maxRepoWidth, true)} ${padColumn(version, maxVersionWidth, true)}`,
        );
      }
    }
  }

  logStats(results, latestVersions);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
