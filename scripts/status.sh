#!/bin/bash

SCRIPT_DIR=$(dirname "$0")
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_lib.sh"

get_git_status() {
    cd "$1" 2>/dev/null || return 1

    # Check if on main branch
    current_branch=$(git branch --show-current 2>/dev/null)
    main_branch=$(get_main_branch)

    local is_on_main
    if [ "$current_branch" == "$main_branch" ]; then
        is_on_main="Yes"
    else
        is_on_main="No"
    fi

    local clean_status
    if is_clean; then
        clean_status="Clean"
    else
        clean_status="Unclean"
    fi

    # Get commit status (ahead/behind)
    local commit_status
    ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
    behind=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "0")

    # Ensure ahead and behind are numeric
    ahead=${ahead:-0}
    behind=${behind:-0}

    if [ "$ahead" -gt 0 ] && [ "$behind" -gt 0 ]; then
        commit_status="Ahead $ahead, behind $behind"
    elif [ "$ahead" -gt 0 ]; then
        commit_status="Ahead $ahead"
    elif [ "$behind" -gt 0 ]; then
        commit_status="Behind $behind"
    else
        commit_status="Up to date"
    fi

    echo "$1|$current_branch|$is_on_main|$clean_status|$commit_status"
}

DIRS=$(node "$SCRIPT_DIR/getRepos.mjs")

# Print table header
printf "%-30s %-20s %-8s %-8s %-20s\n" "Repository" "Branch" "On main" "Status" "Commit Status"
printf "%-30s %-20s %-8s %-8s %-20s\n" "----------" "------" "-------" "------" "-------------"

# Process each repository
for dir in $DIRS; do
    status_info=$(get_git_status "$dir")

    if [ -n "$status_info" ]; then
        IFS='|' read -r name branch is_on_main clean_status commit_status <<< "$status_info"

        # Check if we should auto-pull: on main, clean, and behind
        if [ "$is_on_main" == "Yes" ] && [ "$clean_status" == "Clean" ] && [[ "$commit_status" == *"Behind"* ]]; then
            cd "$dir" || continue
            echo -e "${BLUE}Pulling $name...${NC}"
            git pull > /dev/null 2>&1
            if [ $? -eq 0 ]; then
                # Refresh status after pull
                status_info=$(get_git_status "$dir")
                IFS='|' read -r name branch is_on_main clean_status commit_status <<< "$status_info"
            fi
        fi

        [ "$is_on_main" == "Yes" ] && main_color="${GREEN}" || main_color="${YELLOW}"
        [ "$clean_status" == "Clean" ] && status_color="${GREEN}" || status_color="${RED}"

        # Truncate long names
        if [ ${#name} -gt 28 ]; then
            name="${name:0:25}..."
        fi

        printf "%-30s %-20s " "$name" "$branch"
        printf "${main_color}%-8s${NC} " "$is_on_main"
        printf "${status_color}%-8s${NC} " "$clean_status"
        printf "%-20s\n" "$commit_status"
    else
        printf "%-30s %-20s %-8s %-17s %-8s\n" "$dir" "" "" "${RED}Error${NC}" "Cannot access"
    fi
done
