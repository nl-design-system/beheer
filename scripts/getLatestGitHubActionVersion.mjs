#!/usr/bin/env node

/**
 * Get the latest version of a GitHub Action from the GitHub API.
 * Can be used as a module (getLatestGitHubActionVersion) or run standalone with an action name (e.g. actions/checkout).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LATEST_VERSIONS_FILE = join(__dirname, 'cache', 'github-actions-latest-versions.yaml');

// Cache for GitHub API responses to avoid rate limiting (populated from file when present)
const versionCache = new Map();

/**
 * @type {Promise<void>|null}
 */
let fileLoadPromise = null;

/**
 * Load version cache from the cache file.
 *
 * @returns {Promise<void>}
 */
const loadVersionsCache = async () => {
  // Only load the file once per process.
  if (fileLoadPromise !== null) {
    return fileLoadPromise;
  }

  fileLoadPromise = readFile(LATEST_VERSIONS_FILE, 'utf-8')
    .then((contents) => {
      const data = yaml.load(contents);
      if (data && typeof data === 'object') {
        for (const [action, version] of Object.entries(data)) {
          versionCache.set(action, version);
        }
      }
    })
    .catch((error) => {
      if (error.code !== 'ENOENT') {
        console.error('Could not read version cache file:', error.message);
      }
    });

  return fileLoadPromise;
};

/**
 * Load cache from file and return a copy of the version cache (cache-only, no fetch).
 * Use this when you need all cached versions, e.g. for reporting without --fetch.
 *
 * @returns {Promise<Map<string, string|null>>}
 */
export const getVersionsCache = async () => {
  await loadVersionsCache();

  return new Map(versionCache);
};

/**
 * Save versions cache to the cache file.
 *
 * @returns {Promise<void>}
 */
const saveVersionsCache = async () => {
  try {
    await mkdir(dirname(LATEST_VERSIONS_FILE), { recursive: true });
    const data = Object.fromEntries(versionCache);
    const yamlStr = yaml.dump(data, { lineWidth: -1 });
    await writeFile(LATEST_VERSIONS_FILE, yamlStr, 'utf-8');
  } catch (error) {
    console.error('Could not write version cache file:', error.message);
  }
};

/**
 * Parse a version string to extract semantic version parts.
 *
 * @param {string} version - Version string (e.g., 'v13.3.3', '1.2.3')
 * @returns {Object|null} - {major, minor, patch, prerelease, original}
 */
const parseSemanticVersion = (version) => {
  const normalized = version.replace(/^v/, '');
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/);

  if (match) {
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4] || null,
      original: version,
    };
  }

  return null;
};

/**
 * Compare two semantic versions.
 *
 * @param {Object} a - Parsed version object
 * @param {Object} b - Parsed version object
 * @returns {number} - Negative if a < b, positive if a > b, 0 if equal
 */
const compareVersions = (a, b) => {
  if (a.major !== b.major) return b.major - a.major;
  if (a.minor !== b.minor) return b.minor - a.minor;
  if (a.patch !== b.patch) return b.patch - a.patch;

  // If both have prerelease, compare them
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease);
  }
  // Stable versions come before prereleases
  if (a.prerelease && !b.prerelease) return 1;
  if (!a.prerelease && b.prerelease) return -1;

  return 0;
};

/**
 * Detect if the GitHub API response indicates a rate limit error.
 *
 * @param {Response} response
 * @returns {boolean}
 */
const isRateLimitError = (response) => response.status === 403;

/**
 * Fetch the latest version of a GitHub Action from the GitHub API.
 *
 * @param {string} action - Action name (e.g., 'actions/checkout')
 * @returns {Promise<string|null>}
 */
export const fetchLatestGitHubActionVersion = async (action) => {
  try {
    const [owner, repo] = action.split('/');
    if (!owner || !repo) {
      return null;
    }

    // For GitHub Actions, tags are more reliable than releases
    // Get all tags and find the latest semantic version
    const tagsResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'github-actions-checker',
      },
    });

    if (isRateLimitError(tagsResponse)) {
      return null;
    }

    if (tagsResponse.ok) {
      const tags = await tagsResponse.json();
      if (tags && tags.length > 0) {
        // Parse all tags and find the latest semantic version
        const parsedVersions = tags
          .map((tag) => ({
            name: tag.name,
            parsed: parseSemanticVersion(tag.name),
          }))
          .filter((v) => v.parsed !== null); // Only keep valid semantic versions

        if (parsedVersions.length > 0) {
          // Prefer latest stable; ignore prereleases (e.g. v3.0.0-beta.1) when a stable exists (e.g. v2.2.1)
          const stableOnly = parsedVersions.filter((v) => v.parsed.prerelease === null);
          const candidates = stableOnly.length > 0 ? stableOnly : parsedVersions;
          candidates.sort((a, b) => compareVersions(a.parsed, b.parsed));
          const latestTag = candidates[0].name;
          versionCache.set(action, latestTag);
          await saveVersionsCache();
          return latestTag;
        }

        // If no semantic versions found, return the first tag
        const latestTag = tags[0].name;
        versionCache.set(action, latestTag);
        await saveVersionsCache();
        return latestTag;
      }
    }

    // Fallback to releases if tags don't work
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'github-actions-checker',
      },
    });

    if (isRateLimitError(response)) {
      return null;
    }

    if (response.ok) {
      const data = await response.json();
      const latestVersion = data.tag_name;
      versionCache.set(action, latestVersion);
      await saveVersionsCache();

      return latestVersion;
    }

    versionCache.set(action, null);
    await saveVersionsCache();

    return null;
  } catch (error) {
    console.error(`Error fetching version for ${action}:`, error.message);
    const rateLimited = /rate limit/i.test(error.message ?? '');
    if (!rateLimited) {
      versionCache.set(action, null);
      await saveVersionsCache();
    }

    return null;
  }
};

/**
 * Get the latest version of a GitHub Action, using cache, and falling back to fetch.
 *
 * @param {string} action - Action name (e.g., 'actions/checkout')
 * @returns {Promise<string|null>}
 */
export const getLatestGitHubActionVersion = async (action) => {
  await loadVersionsCache();

  if (versionCache.has(action)) {
    return versionCache.get(action);
  }

  return fetchLatestGitHubActionVersion(action);
};

const main = async () => {
  const args = process.argv.slice(2);
  const useCache = !args.includes('--fetch');

  const action = args.find((a) => a && !a.startsWith('--'));
  if (!action) {
    console.error('Usage: getLatestGitHubActionVersion.mjs <action> [--fetch]');
    console.error('Example: getLatestGitHubActionVersion.mjs actions/checkout');
    console.error('         getLatestGitHubActionVersion.mjs actions/checkout --fetch');
    process.exit(1);
  }

  const v = useCache ? await getLatestGitHubActionVersion(action) : await fetchLatestGitHubActionVersion(action);
  console.log(v ?? '');
};

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
