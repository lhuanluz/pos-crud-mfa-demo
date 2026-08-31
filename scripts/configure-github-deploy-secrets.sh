#!/usr/bin/env bash
# One-command bootstrap for the GitHub Actions production deploy secrets.
# It reads the dedicated local deploy key; it never prints secret values.
set -euo pipefail

REPOSITORY="lhuanluz/pos-crud-mfa-demo"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRIVATE_KEY="$HOME/.ssh/pos-crud-mfa-actions_ed25519"

# The inherited integration token can push code but cannot manage Actions
# Secrets. Do not let it shadow a personal GitHub CLI authentication.
unset GH_TOKEN GITHUB_TOKEN

gh_personal() {
  env -u GH_TOKEN -u GITHUB_TOKEN command gh "$@"
}

KNOWN_HOSTS="$HOME/.ssh/pos-crud-mfa-actions_known_hosts"

for file in "$PRIVATE_KEY" "$KNOWN_HOSTS"; do
  if [[ ! -f "$file" ]]; then
    echo "Required local deployment material not found: $file" >&2
    exit 1
  fi
done

if ! command -v gh >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "GitHub CLI (gh) is required. Install it, then run this command again." >&2
    exit 1
  fi
  brew install gh
fi

# Uses an existing personal GitHub CLI session. If none exists, GitHub opens
# a browser/device authorization flow; do not use an app-only token here.
if ! gh_personal auth status --hostname github.com >/dev/null 2>&1; then
  gh_personal auth login --hostname github.com --web --git-protocol https --scopes repo,workflow
fi

set_secret() {
  local name="$1"
  local value="$2"
  printf 'Configuring %s...\n' "$name"
  gh_personal secret set "$name" --repo "$REPOSITORY" --body "$value"
}

set_secret SERVER_HOST "147.15.124.129"
set_secret SERVER_PORT "22"
set_secret SERVER_USER "ubuntu"
set_secret APP_PATH "/opt/pos-crud-mfa-demo"
gh_personal secret set SERVER_SSH_PRIVATE_KEY --repo "$REPOSITORY" < "$PRIVATE_KEY"
gh_personal secret set SERVER_SSH_KNOWN_HOSTS --repo "$REPOSITORY" < "$KNOWN_HOSTS"

expected=(SERVER_HOST SERVER_PORT SERVER_USER APP_PATH SERVER_SSH_PRIVATE_KEY SERVER_SSH_KNOWN_HOSTS)
actual="$(gh_personal secret list --repo "$REPOSITORY" --json name --jq '.[].name')"
for name in "${expected[@]}"; do
  if ! grep -Fxq "$name" <<<"$actual"; then
    echo "GitHub did not confirm secret metadata for: $name" >&2
    exit 1
  fi
done

ref="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
printf 'Secrets configured. Starting protected deploy for %.12s...\n' "$ref"
gh_personal workflow run "Deploy production" --repo "$REPOSITORY" -f ref="$ref"
printf 'Deploy started. Follow: https://github.com/%s/actions\n' "$REPOSITORY"
