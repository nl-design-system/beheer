#!/bin/bash

RED=$(tput setaf 1)
GREEN=$(tput setaf 2)
YELLOW=$(tput setaf 3; tput bold)
BLUE=$(tput setaf 4)
NC=$(tput sgr0) # No Color
BOLD=$(tput bold)

# Check if a given directory is a git repository
is_git_repo() {
  [ -d "${1:-.}/.git" ]
}

# Check if the working tree is clean
is_clean() {
  git -C "${1:-.}" status --porcelain | grep -q '^[^?]'
}

# Get the main branch of a git repository; for some repos this can be "master"
get_main_branch() {
  git -C "${1:-.}" remote show origin | sed -n '/HEAD branch/s/.*: //p'
}
