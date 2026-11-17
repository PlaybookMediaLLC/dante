#!/usr/bin/env bash
# Run with a gh login/token that has repository Administration write access.
# GH_REPO names the repository; without it the script reads this checkout's
# origin remote. gh's own default can resolve to an `upstream` remote, which in
# this fork is the original project.
set -euo pipefail
cd "$(dirname "$0")/../.."
origin="$(git remote get-url origin)"
origin="${origin%.git}"
repository="${GH_REPO:-${origin##*github.com[:/]}}"
printf 'Configuring %s\n' "$repository"
gh api --method PATCH "repos/$repository" -f default_branch=develop >/dev/null
for branch in develop main; do
  ruleset_name="$branch branch flow"
  rule_id="$(gh api "repos/$repository/rulesets" --paginate --jq ".[] | select(.name == \"$ruleset_name\") | .id")"
  if [ -n "$rule_id" ]; then
    gh api --method PUT "repos/$repository/rulesets/$rule_id" --input ".github/rulesets/$branch.json" >/dev/null
  else
    gh api --method POST "repos/$repository/rulesets" --input ".github/rulesets/$branch.json" >/dev/null
  fi
done
# Read the rules back: CI narrows pull requests only behind a queue that
# requires CI validation, and finds out from these same rules.
rules=" $(gh api "repos/$repository/rules/branches/develop" --jq '[.[].type] | join(" ")') "
for rule in merge_queue required_status_checks; do
  case "$rules" in
    *" $rule "*) ;;
    *) printf 'develop has no %s rule in force (it has:%s)\n' "$rule" "$rules" >&2; exit 1 ;;
  esac
done
printf '%s\n' "Default branch: develop. Rules in force on develop:$rules"
