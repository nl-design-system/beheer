#!/bin/bash

# This script:
#  - checks out the main branch of all repositories, and
#  - pulls the latest changes

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

DIRS=$(node "$SCRIPT_DIR/getRepos.mjs")

for dir in $DIRS; do
  echo "${BOLD}$dir${NC}"

  if is_git_repo "$dir"; then
    (
      cd "$dir" || exit
      MAIN_BRANCH=$(get_main_branch)
      git checkout "$MAIN_BRANCH" 2>/dev/null || echo "Checkout failed in $dir"
      git pull --ff-only || echo "Pull failed in $dir"
    )
  else
    echo "$dir is not a git repo"
  fi

  echo
done
