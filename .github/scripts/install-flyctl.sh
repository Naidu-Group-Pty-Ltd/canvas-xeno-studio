#!/usr/bin/env bash
# Installs Fly's CLI (flyctl) from its latest GitHub release, the archive
# checked against the release's own list of checksums, and puts it on the
# job's PATH. Used by deploy-media-worker.yml, and by test-media-worker.yml
# so a branch shows it installs before main deploys with it.
#
# Not by an outside action: GitHub refused to start the deploy workflow while
# it used one (superfly/flyctl-actions, 23 October 2026), and workflows using
# only GitHub's own actions ran. That action also fetched the latest flyctl,
# but without checking it.
#
# Needs GH_TOKEN (the job's github.token reads a public release).
set -euo pipefail

repo=superfly/flyctl
tag=$(gh release view --repo "$repo" --json tagName --jq .tagName)
assets=$(gh release view "$tag" --repo "$repo" --json assets --jq '.assets[].name')
archive=$(grep -E '^flyctl_[0-9][0-9.]*_Linux_x86_64\.tar\.gz$' <<<"$assets" || true)
sums=$(grep -E '^checksums\.txt$' <<<"$assets" || true)
if [ -z "$archive" ] || [ -z "$sums" ]; then
  echo "::error::flyctl $tag has no Linux x86_64 archive and checksums.txt to install from"
  exit 1
fi

dir="${RUNNER_TEMP:-/tmp}/flyctl"
rm -rf "$dir" && mkdir -p "$dir/bin"
gh release download "$tag" --repo "$repo" --dir "$dir" --pattern "$archive" --pattern "$sums"
# The archive's line from the release's list, checked; a missing line fails too.
(cd "$dir" && grep -E "  $archive\$" "$sums" | sha256sum --check --strict)
tar -xzf "$dir/$archive" -C "$dir/bin" flyctl
"$dir/bin/flyctl" version
if [ -n "${GITHUB_PATH:-}" ]; then echo "$dir/bin" >> "$GITHUB_PATH"; fi
echo "Installed flyctl $tag"
