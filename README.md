# NL Design System beheer repository

This repository serves as the central management hub for the NL Design System project.

This repository is primarily used for:

- **GitHub Issues**: tracking project-wide tasks across the NL Design System ecosystem
- **Maintenance scripts**: scripts and automation tools that aid in propagating changes efficiently across multiple repositories. Note: these scripts are primarily intended for internal use and may not be fully documented or supported for external contributors.
- **Maintenance knowledge base**: technical notes to support maintenance tasks. Note: whenever possible, documenting things on [the website](nldesignsystem.nl) instead is preferred.

# Maintenance scripts

This repo assumes it is checked out in the same folder, alongside other repos.

- `scripts/checkout.sh`: checkout main branch in all repos and pull latest
- `scripts/status.sh`: for each repo, output the current branch and commit status

# Maintenance docs

- [Troubleshooting GitHub Actions](docs/troubleshooting-github-actions.md)
