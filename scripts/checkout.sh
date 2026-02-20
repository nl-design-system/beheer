#!/bin/sh

# This script:
#  - checks out the main branch of all repositories, and
#  - pulls the latest changes

SCRIPT_DIR=$(dirname "$0")
DIRS=$(node "$SCRIPT_DIR/getRepos.mjs")

get_main_branch() {
  git remote show origin | sed -n '/HEAD branch/s/.*: //p'
}

for dir in $DIRS; do
  echo "\033[1m$dir\033[0m"

  if [ -d "$dir/.git" ]; then
    # shellcheck disable=SC2164
    cd "$dir"

    MAIN_BRANCH=$(get_main_branch "$dir")
    git checkout "$MAIN_BRANCH" 2>/dev/null || echo "No main branch in $dir"
    git pull --ff-only || echo "Failed in $dir"

    # shellcheck disable=SC2103
    cd ..
    echo
  else
    echo "$dir is not a git repo"
  fi
done
