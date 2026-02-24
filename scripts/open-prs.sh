#!/bin/bash

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

DIRS=$(node "$SCRIPT_DIR/getRepos.mjs")

for dir in $DIRS; do
  echo "${BOLD}$dir${NC}"

  if is_git_repo "$dir"; then
    cd "$dir" || continue

    prs=$(gh pr list --limit 10 --state open --json number,title,state,url,createdAt --author="@me" --jq '.[] | "\(.number): \(.title) (\(.state)) - \(.url)"' 2>/dev/null)
    if [ -n "$prs" ]; then
      echo "$prs"
    else
      echo "No open PRs by you in this repository"
    fi

    cd ..

    echo
  else
    echo "$dir is not a git repo"
  fi
done
