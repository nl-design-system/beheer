# Chromatic fails on fork PRs

In fork PRs, the Chromatic step might fail with a "Missing project token" error.
This is because this token is secret, and secrets are not available to GitHub Actions in forks.
There is good reason: this can otherwise be abused to use up paid snapshot quota by sending in a lot of PRs.

When the check is required, the fork PR can never be merged.
To solve this without exposing the token, there is no ideal solution.
The options are:

1. Let a team member recreate the PR.
2. Add the user to the contributors group so they may make a direct PR.
3. Remove the required check (dangerous, but a team can choose to accept this risk).
4. Skip Chromatic for fork PRs (dangerous, especially if a team is used to this check catching errors before merging).

## How to fix

Adding users and configuring required checks is done through Terraform.

### How to skip Chromatic for fork PRs

Skipping Chromatic is done in the GitHub workflow.
Using the `skip` option will not run the check but mark the check as passed.

```yaml
- name: Run Chromatic
  id: chromatic
  uses: chromaui/action@xxx # pin this to the latest version hash
  with:
    skip: ${{ github.event.pull_request.head.repo.full_name != github.repository }}
    projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}

    # when `skip` is already used to skip dependabot PRs, amend it like this
    #skip: >-
    #  ${{
    #    github.event.pull_request.head.repo.full_name != github.repository ||
    #    github.actor == 'dependabot[bot]'
    #  }}
```

If you choose for this discouraged option, at least ensure reviewers are informed by notifying them on the PR.

```yaml
permissions:
  pull-requests: write

steps:
  - name: Comment on PR
    if: steps.chromatic.outcome == 'skipped'
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      REPO: ${{ github.repository }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
    run: |
      gh pr comment "$PR_NUMBER" \
        --repo "$REPO" \
        --body "⚠️ **Chromatic skipped**
      This pull request originates from a fork, so Chromatic visual regression tests were skipped because the repository's Chromatic project token is not available to fork workflows.
      The check is marked as passed, but it did not run.
      This means if there is a visual regression, it may only be detected in other PRs.
      Consider creating this PR from the original repo so Chromatic runs.
      Other CI checks will continue to run normally.
      "
```
