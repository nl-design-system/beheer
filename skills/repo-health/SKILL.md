---
name: repo-health
description: >
  NL Design System repository health and maintenance across dependency
  management, CI/CD reliability, tooling standardization, and security.
  Use when auditing or updating repos for deprecated packages, standardizing
  CLI tooling, fixing CI, remediating vulnerabilities, or general maintenance.
---

# Repository health

Repository health covers these four areas:

1. **Dependency management**: updates, compatibility, and deprecation handling
2. **CI/CD reliability**: GitHub Actions workflows, build pipelines, tests, and automation
3. **Tooling standardization**: consistent linters, formatters, configurations, and development tools across repositories
4. **Security and compliance**: audits, vulnerability remediation, and policy enforcement

This skill grows over time.
Apply only the cases relevant to the current task.
Read the linked reference before making changes.
Never commit or make PRs unless explicitly instructed.

## Cases

- [CLI package preferences](reference/cli-packages.md) — preferred maintained CLIs for copy, clean, and script orchestration (`cpy-cli`, `rimraf`, `npm-run-all2`)
