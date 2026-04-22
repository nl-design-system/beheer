#!/usr/bin/env node

/* Script to retrieve metadata of all npm packages in the NL Design System scope
 * and report on them.
 *
 * It has a rudimentary cache to avoid unnecessary API calls.  Use `--fetch` to
 * override.
 *
 * Configure the organizations to check in the `repos.config.yaml` file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPOS_CONFIG_FILE = path.join(__dirname, '../repos.config.yaml');
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'npm-packages.yaml');
const MAX_RETRIES = 3;

const reposConfigSchema = z.object({
  npmOrgs: z.array(z.string().trim().min(1)).default([]),
});

const cachePackageSchema = z.object({
  name: z.string(),
  version: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  provenance: z.boolean().optional(),
  deprecated: z.boolean().optional(),
});

const cacheSchema = z.object({
  packages: z.array(cachePackageSchema).default([]),
});

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const fetchJsonWithRetry = async (url) => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) {
      return await res.json();
    }

    const isRetryable = res.status === 429 || res.status >= 500;
    const isLastAttempt = attempt === MAX_RETRIES - 1;
    if (!isRetryable || isLastAttempt) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`);
    }

    const retryAfterSeconds = Number(res.headers.get('retry-after') || '0');
    const retryDelayMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 500 * 2 ** attempt;
    await sleep(retryDelayMs);
  }

  throw new Error(`Failed to fetch ${url}: max retries exceeded`);
};

const hasProvenance = (versionData) => {
  const dist = versionData?.dist;
  if (!dist) {
    return false;
  }

  return Boolean(dist.attestations?.provenance);
};

const getNpmOrgs = () => {
  const contents = fs.readFileSync(REPOS_CONFIG_FILE, 'utf8');
  const config = reposConfigSchema.parse(yaml.load(contents));

  return config.npmOrgs;
};

const fetchPackagesForOrg = async (org) => {
  const orgName = org.startsWith('@') ? org.slice(1) : org;
  const orgPackagesUrl = `https://registry.npmjs.org/-/org/${encodeURIComponent(orgName)}/package`;
  const data = await fetchJsonWithRetry(orgPackagesUrl);
  return Object.keys(data);
};

const fetchPackages = async (orgs) => {
  const packageNames = new Set();

  for (const org of orgs) {
    console.log(`Checking org ${org}...`);
    const orgPackageNames = await fetchPackagesForOrg(org);
    for (const packageName of orgPackageNames) {
      packageNames.add(packageName);
    }
  }

  return [...packageNames];
};

const fetchPackageDetails = async (name) => {
  let data;

  try {
    data = await fetchJsonWithRetry(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  } catch {
    return { name, error: true };
  }

  const latestVersion = data['dist-tags']?.latest;
  const versionData = data.versions?.[latestVersion];
  const date = latestVersion ? (data.time?.[latestVersion] ?? null) : null;
  const provenance = hasProvenance(versionData);
  return {
    name,
    version: latestVersion,
    date,
    license: versionData?.license ?? null,
    provenance,
    deprecated: Boolean(versionData?.deprecated),
  };
};

const readCache = () => {
  if (!fs.existsSync(CACHE_FILE)) {
    return new Map();
  }

  const contents = fs.readFileSync(CACHE_FILE, 'utf8');
  const parsed = cacheSchema.safeParse(yaml.load(contents));
  if (!parsed.success) {
    return new Map();
  }

  return new Map(parsed.data.packages.map((pkg) => [pkg.name, pkg]));
};

const writeCache = (orgs, results) => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const sortedResults = [...results].sort((a, b) => a.name.localeCompare(b.name));
  const payload = {
    orgs,
    generatedAt: new Date().toISOString(),
    packages: sortedResults.map((pkg) => ({
      name: pkg.name,
      version: pkg.version ?? null,
      date: pkg.date ?? null,
      license: pkg.license ?? null,
      provenance: Boolean(pkg.provenance),
      deprecated: Boolean(pkg.deprecated),
    })),
  };

  fs.writeFileSync(CACHE_FILE, yaml.dump(payload), 'utf8');
};

const fetchPackageMetadata = async ({ forceFetch, orgs }) => {
  const packageNames = await fetchPackages(orgs);
  const cache = readCache();
  const resultsMap = new Map();

  for (const packageName of packageNames) {
    console.log(`Checking package ${packageName}...`);
    const cachedPackage = cache.get(packageName);
    if (cachedPackage) {
      resultsMap.set(packageName, {
        ...cachedPackage,
        license: cachedPackage.license ?? null,
        deprecated: Boolean(cachedPackage.deprecated),
      });
    }

    const shouldFetch = forceFetch || !cachedPackage;
    if (!shouldFetch) {
      continue;
    }

    const details = await fetchPackageDetails(packageName);
    resultsMap.set(packageName, details);
    writeCache(orgs, [...resultsMap.values()]);
  }

  const results = packageNames.map((packageName) => resultsMap.get(packageName)).filter(Boolean);

  return {
    results,
    forceFetch,
  };
};

const reportResults = ({ results }) => {
  console.log('\n\nResults:\n');
  console.table(
    results.map((p) => ({
      name: p.name,
      version: p.version,
      license: p.license,
      provenance: p.provenance ? '✅' : '❌',
      deprecated: p.deprecated ? 'deprecated' : null,
    })),
  );

  const withoutProvAndNotDeprecated = results
    .filter((p) => !p.provenance && !p.deprecated)
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log('\nPackages without provenance that are not deprecated:\n');
  console.table(
    withoutProvAndNotDeprecated.map((p) => ({
      name: p.name,
      version: p.version,
    })),
  );
};

const main = async () => {
  const forceFetch = process.argv.includes('--fetch');
  const orgs = getNpmOrgs();
  if (orgs.length === 0) {
    throw new Error(`No npmOrgs configured in ${REPOS_CONFIG_FILE}`);
  }

  const reportData = await fetchPackageMetadata({ forceFetch, orgs });
  reportResults(reportData);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
