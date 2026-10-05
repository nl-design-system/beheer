# NL Design System beheer repository

This repository serves as the central management hub for the NL Design System project.

This repository is primarily used for:

- **GitHub Issues**: tracking project-wide tasks across the NL Design System ecosystem
- **Maintenance scripts**: scripts and automation tools that aid in propagating changes efficiently across multiple repositories. Note: these scripts are primarily intended for internal use and may not be fully documented or supported for external contributors.
- **Maintenance knowledge base**: technical notes to support maintenance tasks. Note: whenever possible, documenting things on [the website](https://nldesignsystem.nl) instead is preferred.

## Maintenance docs

- [Troubleshooting GitHub Actions](docs/troubleshooting-github-actions.md)
- [Sending a Slack notification in GitHub Actions](docs/slack-notifications.md)

## Taskfile

We use Taskfile to simplify running tasks across repos.

Install it following the [instructions](https://taskfile.dev/docs/installation).

Then initialize a `Taskfile.yml` as follows:

```sh
cat > Taskfile.yml <<'EOF'
# yaml-language-server: $schema=https://taskfile.dev/schema.json

version: "3"

includes:
  lib:
    taskfile: ./Taskfile.dist.yml
    flatten: true
  all:
    taskfile: ./tasks/all.yml
  current:
    taskfile: ./tasks/REPLACE-ME.yml
    flatten: true
EOF
```

Also initialize a `Taskfile.yml` in the parent folder, assuming that's where all checked-out repositories are stored (this will allow you to use `beheer`'s Taskfile in all repos):

```sh
cat > ../Taskfile.yml <<'EOF'
# yaml-language-server: $schema=https://taskfile.dev/schema.json

version: "3"

includes:
  beheer:
    taskfile: ./beheer/Taskfile.yml
    flatten: true
EOF
```

Create a task in the `tasks/` folder. For example:

```yaml
# yaml-language-server: $schema=https://taskfile.dev/schema.json

version: '3'

vars:
  BRANCH: chore/pnpm-11.15.1
  PR_TITLE: 'chore: upgrade pnpm to 11.15.1'
  PR_BODY: |
    This PR upgrades pnpm to the latest version.  We currently pin 11.5 but there has been a lot of development since then.  Check out their [changelogs](https://pnpm.io/blog/releases/11.6).  Notable changes are minor security improvements and a bugfix that affected [lux](https://github.com/nl-design-system/lux/pull/650).
  GH_ISSUE: 'https://github.com/nl-design-system/beheer/issues/87'

tasks:
  apply:
    desc: Apply changes
    aliases: [a]
    dir: '{{.USER_WORKING_DIR}}'
    cmds:
      - corepack use pnpm@11
```

This will allow you to run `task` in the CLI.
With the above example, you can type `task checkout`, a "global" task from `Taskfile.dist.yml`, to checkout the branch as specified in `vars.BRANCH`.
And `task apply` would apply the changes from your taskfile.
The idea is to have a taskfile per task you're working on.
