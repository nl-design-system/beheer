#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const REPOS_FILE = '../repos.config.yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get all repositories listed in the config as an array of strings.
 */
export function getRepos() {
  const filePath = path.join(__dirname, REPOS_FILE);
  const contents = fs.readFileSync(filePath, 'utf8');
  const config = yaml.load(contents);

  return config.repos || [];
}

async function main() {
  getRepos().forEach((repo) => {
    console.log(repo);
  });
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
